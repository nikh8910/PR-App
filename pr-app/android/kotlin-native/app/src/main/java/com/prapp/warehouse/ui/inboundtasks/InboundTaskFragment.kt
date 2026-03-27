package com.prapp.warehouse.ui.inboundtasks

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.textfield.TextInputEditText
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.utils.NetworkResult

class InboundTaskFragment : Fragment() {

    private val viewModel: InboundTaskViewModel by viewModels()
    private lateinit var adapter: InboundTaskAdapter

    private lateinit var btnBack: ImageView
    private lateinit var btnHome: ImageView
    
    private lateinit var inputWarehouse: TextInputEditText
    private lateinit var spinnerSearchBy: Spinner
    private lateinit var labelSearchInput: TextView
    private lateinit var inputSearchValue: TextInputEditText
    private lateinit var btnSearch: Button
    
    // Optional filters
    private lateinit var layoutOptionalFilters: LinearLayout
    private lateinit var inputSupplier: TextInputEditText
    private lateinit var inputDateFrom: TextInputEditText
    private lateinit var inputDateTo: TextInputEditText
    
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    
    private lateinit var layoutResultsHeader: LinearLayout
    private lateinit var textResultsCount: TextView
    private lateinit var checkboxOpen: CheckBox
    private lateinit var checkboxCompleted: CheckBox
    
    private lateinit var recyclerTasks: RecyclerView
    
    private var allTasks: List<WarehouseTask> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_inbound_tasks, container, false)

        btnBack = view.findViewById(R.id.btn_back)
        btnHome = view.findViewById(R.id.btn_home)
        
        inputWarehouse = view.findViewById(R.id.input_warehouse)
        spinnerSearchBy = view.findViewById(R.id.spinner_search_by)
        labelSearchInput = view.findViewById(R.id.label_search_input)
        inputSearchValue = view.findViewById(R.id.input_search_value)
        btnSearch = view.findViewById(R.id.btn_search)
        
        layoutOptionalFilters = view.findViewById(R.id.layout_optional_filters)
        inputSupplier = view.findViewById(R.id.input_supplier)
        inputDateFrom = view.findViewById(R.id.input_date_from)
        inputDateTo = view.findViewById(R.id.input_date_to)
        
        progressBar = view.findViewById(R.id.progress_bar)
        errorText = view.findViewById(R.id.text_error)
        
        layoutResultsHeader = view.findViewById(R.id.layout_results_header)
        textResultsCount = view.findViewById(R.id.text_results_count)
        checkboxOpen = view.findViewById(R.id.checkbox_open)
        checkboxCompleted = view.findViewById(R.id.checkbox_completed)
        
        recyclerTasks = view.findViewById(R.id.recycler_tasks)

        btnBack.setOnClickListener { findNavController().navigateUp() }
        btnHome.setOnClickListener { findNavController().popBackStack(R.id.dashboardFragment, false) }

        val searchOptions = arrayOf("Inbound Delivery", "Product / GTIN", "Handling Unit")
        val spinnerAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, searchOptions)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerSearchBy.adapter = spinnerAdapter
        
        spinnerSearchBy.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) {
                when (position) {
                    0 -> {
                        labelSearchInput.text = "DELIVERY NUMBER"
                        inputSearchValue.hint = "Scan or type IBD..."
                        layoutOptionalFilters.visibility = View.VISIBLE
                    }
                    1 -> {
                        labelSearchInput.text = "PRODUCT ID OR GTIN"
                        inputSearchValue.hint = "Scan GTIN or type Product ID"
                        layoutOptionalFilters.visibility = View.GONE
                    }
                    2 -> {
                        labelSearchInput.text = "HANDLING UNIT"
                        inputSearchValue.hint = "Scan or type HU..."
                        layoutOptionalFilters.visibility = View.GONE
                    }
                }
                inputSearchValue.text?.clear()
                layoutResultsHeader.visibility = View.GONE
                adapter.submitList(emptyList())
                errorText.visibility = View.GONE
            }
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        }

        adapter = InboundTaskAdapter { task ->
            if (task.warehouseTaskStatus != "C") {
                val bundle = Bundle().apply {
                    putString("warehouse", task.ewmWarehouse ?: inputWarehouse.text.toString())
                    putString("taskId", task.warehouseTask ?: "")
                    putString("taskItem", task.warehouseTaskItem ?: "")
                }
                findNavController().navigate(R.id.action_inboundTasks_to_putaway, bundle)
            }
        }

        recyclerTasks.layoutManager = LinearLayoutManager(requireContext())
        recyclerTasks.adapter = adapter

        btnSearch.setOnClickListener {
            val warehouse = inputWarehouse.text.toString().trim()
            val searchValue = inputSearchValue.text.toString().trim()
            val searchType = spinnerSearchBy.selectedItemPosition

            val supplier = inputSupplier.text.toString().trim()
            val dateFrom = inputDateFrom.text.toString().trim()
            val dateTo = inputDateTo.text.toString().trim()

            if (warehouse.isBlank()) {
                showError("Warehouse is required.")
                return@setOnClickListener
            }

            if (searchValue.isBlank() && searchType == 0 && supplier.isBlank() && dateFrom.isBlank() && dateTo.isBlank()) {
                showError("Please enter a valid Delivery Document or use the optional filters.")
                return@setOnClickListener
            } else if (searchValue.isBlank() && searchType == 1) {
                showError("Please enter a Product ID or scan a GTIN.")
                return@setOnClickListener
            } else if (searchValue.isBlank() && searchType == 2) {
                showError("Please enter a valid Handling Unit.")
                return@setOnClickListener
            }

            var delivery = ""
            var hu = ""
            var product = ""

            when (searchType) {
                0 -> delivery = searchValue
                1 -> product = searchValue
                2 -> hu = searchValue
            }

            viewModel.fetchTasks(warehouse, delivery, hu, product, supplier, dateFrom, dateTo)
        }
        
        val filterListener = View.OnClickListener { applyFilters() }
        checkboxOpen.setOnClickListener(filterListener)
        checkboxCompleted.setOnClickListener(filterListener)
        
        val dateSetListener = { input: TextInputEditText ->
            android.app.DatePickerDialog.OnDateSetListener { _, year, month, dayOfMonth ->
                val monthStr = (month + 1).toString().padStart(2, '0')
                val dayStr = dayOfMonth.toString().padStart(2, '0')
                input.setText("$year-$monthStr-$dayStr")
            }
        }
        
        inputDateFrom.setOnClickListener {
            val calendar = java.util.Calendar.getInstance()
            android.app.DatePickerDialog(requireContext(), dateSetListener(inputDateFrom), calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
        }
        
        inputDateTo.setOnClickListener {
            val calendar = java.util.Calendar.getInstance()
            android.app.DatePickerDialog(requireContext(), dateSetListener(inputDateTo), calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
        }

        viewModel.taskList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    errorText.visibility = View.GONE
                    layoutResultsHeader.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    allTasks = result.data ?: emptyList()
                    if (allTasks.isEmpty()) {
                        showError("No open putaway tasks found for ${inputSearchValue.text}")
                        adapter.submitList(emptyList())
                        layoutResultsHeader.visibility = View.GONE
                    } else {
                        errorText.visibility = View.GONE
                        if (allTasks.size == 1 && allTasks[0].warehouseTaskStatus != "C") {
                            val t = allTasks[0]
                            val bundle = Bundle().apply {
                                putString("warehouse", t.ewmWarehouse ?: inputWarehouse.text.toString())
                                putString("taskId", t.warehouseTask ?: "")
                                putString("taskItem", t.warehouseTaskItem ?: "")
                            }
                            findNavController().navigate(R.id.action_inboundTasks_to_putaway, bundle)
                        } else {
                            layoutResultsHeader.visibility = View.VISIBLE
                            applyFilters()
                        }
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    showError(result.message ?: "An error occurred")
                    layoutResultsHeader.visibility = View.GONE
                }
            }
        }

        return view
    }
    
    private fun applyFilters() {
        val showOpen = checkboxOpen.isChecked
        val showCompleted = checkboxCompleted.isChecked
        
        val filtered = allTasks.filter { task ->
            val isCompleted = task.warehouseTaskStatus == "C"
            (isCompleted && showCompleted) || (!isCompleted && showOpen)
        }
        
        textResultsCount.text = "${filtered.size} Shown"
        adapter.submitList(filtered)
    }

    private fun showError(message: String) {
        errorText.visibility = View.VISIBLE
        errorText.text = message
    }
}
