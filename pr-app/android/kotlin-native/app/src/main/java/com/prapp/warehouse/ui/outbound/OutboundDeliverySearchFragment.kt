package com.prapp.warehouse.ui.outbound

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.Gson
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.OutboundDeliveryHeader
import com.prapp.warehouse.utils.NetworkResult

class OutboundDeliverySearchFragment : Fragment() {

    private val viewModel: OutboundDeliveryViewModel by activityViewModels()
    private lateinit var adapter: OutboundDeliveryAdapter

    private lateinit var layoutFilter: ScrollView
    private lateinit var layoutList: LinearLayout
    private lateinit var spinnerSearchBy: Spinner
    private lateinit var editSearchValue: EditText
    private lateinit var labelSearchValue: TextView
    private lateinit var layoutOptionalFilters: LinearLayout
    private lateinit var editShipTo: EditText
    private lateinit var editDateFrom: TextView
    private lateinit var editDateTo: TextView
    private lateinit var btnSearch: Button
    private lateinit var btnScan: ImageView
    private lateinit var btnChangeFilters: TextView
    private lateinit var textResultCount: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var recyclerObdList: RecyclerView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_obd_search, container, false)
        initViews(view)
        setupSpinner()
        setupRecyclerView()
        setupListeners(view)
        observeViewModel()
        return view
    }

    private fun initViews(view: View) {
        layoutFilter = view.findViewById(R.id.layout_filter)
        layoutList = view.findViewById(R.id.layout_list)
        spinnerSearchBy = view.findViewById(R.id.spinner_search_by)
        editSearchValue = view.findViewById(R.id.edit_search_value)
        labelSearchValue = view.findViewById(R.id.label_search_value)
        layoutOptionalFilters = view.findViewById(R.id.layout_optional_filters)
        editShipTo = view.findViewById(R.id.edit_ship_to)
        editDateFrom = view.findViewById(R.id.edit_date_from)
        editDateTo = view.findViewById(R.id.edit_date_to)
        btnSearch = view.findViewById(R.id.btn_search)
        btnScan = view.findViewById(R.id.btn_scan)
        btnChangeFilters = view.findViewById(R.id.btn_change_filters)
        textResultCount = view.findViewById(R.id.text_result_count)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        recyclerObdList = view.findViewById(R.id.recycler_obd_list)
        
        // Hide list initially
        layoutList.visibility = View.GONE
    }

    private fun setupSpinner() {
        val searchOptions = arrayOf("Outbound Delivery", "Handling Unit", "Product")
        val spinnerAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, searchOptions)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerSearchBy.adapter = spinnerAdapter
        
        spinnerSearchBy.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                when (position) {
                    0 -> { // OBD
                        labelSearchValue.text = "DELIVERY NUMBER (optional)"
                        layoutOptionalFilters.visibility = View.VISIBLE
                    }
                    1 -> { // HU
                        labelSearchValue.text = "HANDLING UNIT EXID"
                        layoutOptionalFilters.visibility = View.GONE
                    }
                    2 -> { // Product
                        labelSearchValue.text = "PRODUCT OR GTIN"
                        layoutOptionalFilters.visibility = View.GONE
                    }
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun setupRecyclerView() {
        adapter = OutboundDeliveryAdapter { obd ->
            navigateToDetail(obd)
        }
        recyclerObdList.layoutManager = LinearLayoutManager(requireContext())
        recyclerObdList.adapter = adapter
    }

    private fun setupListeners(view: View) {
        val btnBack: ImageView = view.findViewById(R.id.btn_back)
        btnBack.setOnClickListener { findNavController().popBackStack() }

        btnSearch.setOnClickListener {
            val searchByLabel = spinnerSearchBy.selectedItem.toString()
            val searchByKey = when (searchByLabel) {
                "Outbound Delivery" -> "OBD"
                "Handling Unit" -> "HU"
                "Product" -> "PRODUCT"
                else -> "OBD"
            }
            val searchValue = editSearchValue.text.toString().trim()
            val shipTo = editShipTo.text.toString().trim()
            val dateFrom = editDateFrom.text.toString().trim()
            val dateTo = editDateTo.text.toString().trim()

            viewModel.searchDeliveries(searchByKey, searchValue, shipTo, dateFrom, dateTo)
            
            // Switch to list view
            layoutFilter.visibility = View.GONE
            layoutList.visibility = View.VISIBLE
        }

        btnChangeFilters.setOnClickListener {
            layoutList.visibility = View.GONE
            layoutFilter.visibility = View.VISIBLE
        }

        // Mock scan
        btnScan.setOnClickListener {
            Toast.makeText(requireContext(), "Scanner opens here", Toast.LENGTH_SHORT).show()
        }
        
        // Mock date picker setup (To be implemented using MaterialDatePicker if needed)
        editDateFrom.setOnClickListener { Toast.makeText(requireContext(), "Select Date", Toast.LENGTH_SHORT).show() }
        editDateTo.setOnClickListener { Toast.makeText(requireContext(), "Select Date", Toast.LENGTH_SHORT).show() }
    }

    private fun observeViewModel() {
        viewModel.obdList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    recyclerObdList.visibility = View.GONE
                    textError.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    recyclerObdList.visibility = View.VISIBLE
                    textError.visibility = View.GONE
                    
                    val items = result.data ?: emptyList()
                    adapter.submitList(items)
                    textResultCount.text = "${items.size} Deliveries found"
                    
                    if (items.size == 1) {
                        // Auto-navigate if exactly 1 result is found and we searched by generic param ?
                        // The user specifically requested 1 item auto-navigation for OBDs in previous tickets.
                        navigateToDetail(items.first())
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    recyclerObdList.visibility = View.GONE
                    textError.visibility = View.VISIBLE
                    textError.text = result.message
                }
            }
        }
    }

    private fun navigateToDetail(obd: OutboundDeliveryHeader) {
        viewModel.selectObd(obd)
        
        // Pass JSON payload just in case, but ViewModel also holds currentObd
        val jsonPayload = Gson().toJson(obd)
        val bundle = Bundle().apply {
            putString("obdData", jsonPayload)
        }
        
        findNavController().navigate(R.id.action_obdSearch_to_obdDetail, bundle)
    }
}
