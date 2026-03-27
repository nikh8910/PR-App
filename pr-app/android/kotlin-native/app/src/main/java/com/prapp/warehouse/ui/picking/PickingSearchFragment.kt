package com.prapp.warehouse.ui.picking

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.utils.NetworkResult
import java.text.SimpleDateFormat
import java.util.*

class PickingSearchFragment : Fragment() {

    private lateinit var viewModel: PickingViewModel
    private var allTasks = listOf<WarehouseTask>()
    private lateinit var tasksAdapter: PickingTaskAdapter

    private lateinit var spinnerSearchBy: Spinner
    private lateinit var inputWarehouse: EditText
    private lateinit var inputSearchValue: EditText
    private lateinit var inputShipTo: EditText
    private lateinit var inputDateFrom: EditText
    private lateinit var inputDateTo: EditText
    private lateinit var labelSearchInput: TextView
    private lateinit var layoutOptionalFilters: LinearLayout
    private lateinit var btnSearch: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var layoutResultsHeader: LinearLayout
    private lateinit var textResultsCount: TextView
    private lateinit var checkboxOpen: CheckBox
    private lateinit var checkboxCompleted: CheckBox
    private lateinit var recyclerTasks: RecyclerView

    private val calendar = Calendar.getInstance()
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_picking_search, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        viewModel = ViewModelProvider(this)[PickingViewModel::class.java]

        initViews(view)
        setupSpinner()
        setupDatePickers()
        observeViewModel()

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        view.findViewById<ImageView>(R.id.btn_home).setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        btnSearch.setOnClickListener {
            performSearch()
        }

        checkboxOpen.setOnCheckedChangeListener { _, _ -> updateResults() }
        checkboxCompleted.setOnCheckedChangeListener { _, _ -> updateResults() }
    }

    private fun initViews(view: View) {
        spinnerSearchBy = view.findViewById(R.id.spinner_search_by)
        inputWarehouse = view.findViewById(R.id.input_warehouse)
        inputSearchValue = view.findViewById(R.id.input_search_value)
        inputShipTo = view.findViewById(R.id.input_ship_to)
        inputDateFrom = view.findViewById(R.id.input_date_from)
        inputDateTo = view.findViewById(R.id.input_date_to)
        labelSearchInput = view.findViewById(R.id.label_search_input)
        layoutOptionalFilters = view.findViewById(R.id.layout_optional_filters)
        btnSearch = view.findViewById(R.id.btn_search)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        layoutResultsHeader = view.findViewById(R.id.layout_results_header)
        textResultsCount = view.findViewById(R.id.text_results_count)
        checkboxOpen = view.findViewById(R.id.checkbox_open)
        checkboxCompleted = view.findViewById(R.id.checkbox_completed)
        recyclerTasks = view.findViewById(R.id.recycler_tasks)

        tasksAdapter = PickingTaskAdapter { task ->
            if (task.warehouseTaskStatus != "C") {
                val bundle = Bundle().apply {
                    putString("warehouse", inputWarehouse.text.toString().trim())
                    putString("taskId", task.warehouseTask)
                    putString("taskItem", task.warehouseTaskItem)
                }
                findNavController().navigate(R.id.action_pickingSearch_to_confirmPicking, bundle)
            }
        }
        recyclerTasks.layoutManager = LinearLayoutManager(requireContext())
        recyclerTasks.adapter = tasksAdapter
    }

    private fun setupSpinner() {
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, listOf("Outbound Delivery", "Product / GTIN", "Handling Unit"))
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerSearchBy.adapter = adapter
        
        spinnerSearchBy.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                when (position) {
                    0 -> { // OBD
                        labelSearchInput.text = "DELIVERY NUMBER"
                        inputSearchValue.hint = "Leave empty for all open OBDs"
                        layoutOptionalFilters.visibility = View.VISIBLE
                    }
                    1 -> { // Product
                        labelSearchInput.text = "PRODUCT ID OR GTIN"
                        inputSearchValue.hint = "Scan GTIN or type Product ID"
                        layoutOptionalFilters.visibility = View.GONE
                    }
                    2 -> { // HU
                        labelSearchInput.text = "HU IDENTIFIER"
                        inputSearchValue.hint = "Scan or type HU"
                        layoutOptionalFilters.visibility = View.GONE
                    }
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun setupDatePickers() {
        val dateSetListenerFrom = DatePickerDialog.OnDateSetListener { _, year, month, day ->
            calendar.set(year, month, day)
            inputDateFrom.setText(dateFormat.format(calendar.time))
        }
        inputDateFrom.setOnClickListener {
            DatePickerDialog(requireContext(), dateSetListenerFrom, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
        }

        val dateSetListenerTo = DatePickerDialog.OnDateSetListener { _, year, month, day ->
            calendar.set(year, month, day)
            inputDateTo.setText(dateFormat.format(calendar.time))
        }
        inputDateTo.setOnClickListener {
            DatePickerDialog(requireContext(), dateSetListenerTo, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
        }
    }

    private fun performSearch() {
        val warehouse = inputWarehouse.text.toString().trim()
        val searchValue = inputSearchValue.text.toString().trim()
        
        val searchByPos = spinnerSearchBy.selectedItemPosition
        val searchBy = when (searchByPos) {
            1 -> "Product"
            2 -> "HU"
            else -> "OBD"
        }

        val shipTo = inputShipTo.text.toString().trim()
        val dateFrom = inputDateFrom.text.toString().trim()
        val dateTo = inputDateTo.text.toString().trim()

        if (searchBy != "OBD" && searchValue.isBlank()) {
            textError.text = "Please enter a value to search by."
            textError.visibility = View.VISIBLE
            return
        }

        textError.visibility = View.GONE
        layoutResultsHeader.visibility = View.GONE
        allTasks = emptyList()
        updateResults()

        viewModel.fetchTasks(warehouse, searchValue, searchBy, shipTo, dateFrom, dateTo)
    }

    private fun observeViewModel() {
        viewModel.taskList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnSearch.isEnabled = false
                    btnSearch.text = "Searching..."
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    btnSearch.text = "Find Task"
                    allTasks = result.data ?: emptyList()
                    if (allTasks.isEmpty()) {
                        textError.text = "No picking tasks found."
                        textError.visibility = View.VISIBLE
                    } else {
                        layoutResultsHeader.visibility = View.VISIBLE
                        updateResults()
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    btnSearch.text = "Find Task"
                    textError.text = result.message ?: "Unknown error"
                    textError.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun updateResults() {
        val showOpen = checkboxOpen.isChecked
        val showCompleted = checkboxCompleted.isChecked
        
        val filtered = allTasks.filter {
            if (it.warehouseTaskStatus == "C") showCompleted else showOpen
        }
        
        tasksAdapter.submitList(filtered)
        textResultsCount.text = "${filtered.size} Shown"
    }
}
