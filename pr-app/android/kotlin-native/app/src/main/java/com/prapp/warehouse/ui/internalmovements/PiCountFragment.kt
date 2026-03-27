package com.prapp.warehouse.ui.internalmovements

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem
import com.prapp.warehouse.data.models.EwmPhysicalInventoryCountItem
import com.prapp.warehouse.utils.NetworkResult

class PiCountFragment : Fragment() {

    private lateinit var viewModel: PiCountViewModel
    private lateinit var adapter: PiCountAdapter

    private lateinit var layoutSearch: LinearLayout
    private lateinit var layoutList: LinearLayout
    private lateinit var layoutDetail: LinearLayout
    private lateinit var scrollContent: ScrollView
    private lateinit var progressBar: ProgressBar

    // Search Step
    private lateinit var spinnerWarehouse: Spinner
    private lateinit var inputSearchBin: EditText
    private lateinit var btnSearch: Button

    // List Step
    private lateinit var recyclerPiItems: RecyclerView
    private lateinit var textListHeader: TextView

    // Detail Step
    private lateinit var textDetailBin: TextView
    private lateinit var textDetailProduct: TextView
    private lateinit var textDetailDoc: TextView
    private lateinit var inputCountQty: EditText
    private lateinit var inputCountUom: EditText
    private lateinit var spinnerException: Spinner
    private lateinit var btnPostCount: Button

    private lateinit var textError: TextView
    private lateinit var textSuccess: TextView
    private lateinit var textHeaderTitle: TextView

    private val warehouses = listOf("UKW2", "USW2")
    private val exceptions = listOf(
        ExceptionOption("", "None"),
        ExceptionOption("ZERO", "Zero Count"),
        ExceptionOption("BINE", "Bin Empty"),
        ExceptionOption("HUCT", "Handling Unit Exception"),
        ExceptionOption("HUCO", "HU Complete"),
        ExceptionOption("HUEM", "HU Empty"),
        ExceptionOption("HUMS", "HU Missing")
    )

    private var currentItem: EwmPhysicalInventoryItem? = null
    private var currentCountItem: EwmPhysicalInventoryCountItem? = null
    private var currentStep = "search" // search, list, detail

    data class ExceptionOption(val code: String, val label: String) {
        override fun toString() = if (code.isEmpty()) label else "$label ($code)"
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_pi_count, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = ViewModelProvider(this)[PiCountViewModel::class.java]

        initViews(view)
        setupObservers()
        setupListeners()
        updateUiState("search")
    }

    private fun initViews(view: View) {
        layoutSearch = view.findViewById(R.id.layout_search)
        layoutList = view.findViewById(R.id.layout_list)
        layoutDetail = view.findViewById(R.id.layout_detail)
        scrollContent = view.findViewById(R.id.scroll_content)
        progressBar = view.findViewById(R.id.progress_bar)

        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        inputSearchBin = view.findViewById(R.id.input_search_bin)
        btnSearch = view.findViewById(R.id.btn_search)

        recyclerPiItems = view.findViewById(R.id.recycler_pi_items)
        textListHeader = view.findViewById(R.id.text_list_header)

        textDetailBin = view.findViewById(R.id.text_detail_bin)
        textDetailProduct = view.findViewById(R.id.text_detail_product)
        textDetailDoc = view.findViewById(R.id.text_detail_doc)
        inputCountQty = view.findViewById(R.id.input_count_qty)
        inputCountUom = view.findViewById(R.id.input_count_uom)
        spinnerException = view.findViewById(R.id.spinner_exception)
        btnPostCount = view.findViewById(R.id.btn_post_count)

        textError = view.findViewById(R.id.text_error)
        textSuccess = view.findViewById(R.id.text_success)
        textHeaderTitle = view.findViewById(R.id.text_header_title)

        // Setup Spinners
        val whAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouses)
        whAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = whAdapter

        val exAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, exceptions)
        exAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerException.adapter = exAdapter

        // Setup RecyclerView
        adapter = PiCountAdapter(emptyList()) { item ->
            openDetail(item)
        }
        recyclerPiItems.layoutManager = LinearLayoutManager(context)
        recyclerPiItems.adapter = adapter
    }

    private fun setupListeners() {
        view?.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener {
            handleBackNavigation()
        }

        view?.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        btnSearch.setOnClickListener {
            clearMessages()
            val warehouse = spinnerWarehouse.selectedItem.toString()
            val bin = inputSearchBin.text.toString().trim()
            viewModel.fetchPiItems(warehouse, bin)
        }

        btnPostCount.setOnClickListener {
            val hItem = currentItem ?: return@setOnClickListener
            val cItem = currentCountItem ?: return@setOnClickListener

            val exceptionOpt = spinnerException.selectedItem as ExceptionOption
            val qtyStr = inputCountQty.text.toString().trim()

            if (exceptionOpt.code.isEmpty() && qtyStr.isEmpty()) {
                showError("Enter a count quantity or select an exception code.")
                return@setOnClickListener
            }

            val qty = qtyStr.toDoubleOrNull() ?: 0.0

            viewModel.postCount(hItem, cItem, qty, exceptionOpt.code)
        }
    }

    private fun setupObservers() {
        viewModel.piItems.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnSearch.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    
                    val items = result.data ?: emptyList()
                    if (items.isEmpty()) {
                        showError("No open PI items found.")
                    } else {
                        adapter.updateData(items)
                        textListHeader.text = "Open PI Items (${items.size})"
                        if (items.size == 1) {
                            openDetail(items[0])
                        } else {
                            updateUiState("list")
                        }
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    showError(result.message ?: "Failed to fetch PI items")
                }
            }
        }

        viewModel.postResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnPostCount.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnPostCount.isEnabled = true
                    showSuccess(result.data ?: "Count posted")
                    
                    // Return to list or search after delay
                    view?.postDelayed({
                        val bin = inputSearchBin.text.toString().trim()
                        if (bin.isNotBlank()) {
                            // refresh the search
                            btnSearch.performClick()
                        } else {
                            updateUiState("list") // Go back to list and wait for user
                        }
                    }, 1500)
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnPostCount.isEnabled = true
                    showError(result.message ?: "Failed to post count")
                }
            }
        }
    }

    private fun openDetail(item: EwmPhysicalInventoryItem) {
        currentItem = item
        clearMessages()
        
        // Find the right count item to show, preferring Type 'S' over 'L'
        val countItems = item._WhsePhysicalInventoryCntItem ?: emptyList()
        val stockItems = countItems.filter { it.PhysicalInventoryItemType == "S" }
        currentCountItem = stockItems.firstOrNull() ?: countItems.firstOrNull()

        textDetailBin.text = "Bin: ${item.EWMStorageBin ?: "N/A"}"
        val docNum = item.PhysicalInventoryDocNumber?.trimStart('0') ?: ""
        val itemNum = item.PhysicalInventoryItemNumber?.trimStart('0') ?: ""
        textDetailDoc.text = "Doc: $docNum / Item: $itemNum\nStatus: ${item.PhysicalInventoryStatusText ?: "Open"}"

        if (currentCountItem != null) {
            val cItem = currentCountItem!!
            val prod = cItem.Product ?: "No Product"
            val hu = cItem.HandlingUnitNumber?.let { if (it.isNotBlank() && !it.matches(Regex("^0+$"))) "HU: $it" else null }
            textDetailProduct.text = listOfNotNull(prod, hu).joinToString(" | ")
            inputCountUom.setText(cItem.RequestedQuantityUnit ?: "EA")
        } else {
            textDetailProduct.text = "No detail items available"
            inputCountUom.setText("EA")
        }

        inputCountQty.text?.clear()
        spinnerException.setSelection(0)
        
        updateUiState("detail")
    }

    private fun updateUiState(step: String) {
        currentStep = step
        when (step) {
            "search" -> {
                textHeaderTitle.text = "PI Count"
                layoutSearch.visibility = View.VISIBLE
                layoutList.visibility = View.GONE
                layoutDetail.visibility = View.GONE
            }
            "list" -> {
                textHeaderTitle.text = "Select Document"
                layoutSearch.visibility = View.VISIBLE
                layoutList.visibility = View.VISIBLE
                layoutDetail.visibility = View.GONE
            }
            "detail" -> {
                textHeaderTitle.text = "Enter Count"
                layoutSearch.visibility = View.GONE
                layoutList.visibility = View.GONE
                layoutDetail.visibility = View.VISIBLE
            }
        }
        scrollContent.scrollTo(0, 0)
    }

    private fun handleBackNavigation() {
        when (currentStep) {
            "detail" -> {
                if (adapter.itemCount > 1) {
                    updateUiState("list")
                } else {
                    updateUiState("search")
                }
            }
            "list" -> updateUiState("search")
            else -> findNavController().navigateUp()
        }
    }

    private fun showError(msg: String) {
        textError.text = msg
        textError.visibility = View.VISIBLE
        textSuccess.visibility = View.GONE
    }

    private fun showSuccess(msg: String) {
        textSuccess.text = msg
        textSuccess.visibility = View.VISIBLE
        textError.visibility = View.GONE
    }
    
    private fun clearMessages() {
        textError.visibility = View.GONE
        textSuccess.visibility = View.GONE
    }
}
