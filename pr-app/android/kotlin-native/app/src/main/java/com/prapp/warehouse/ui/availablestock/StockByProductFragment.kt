package com.prapp.warehouse.ui.availablestock

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
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
import com.prapp.warehouse.data.models.WarehouseStockItem
import com.prapp.warehouse.data.models.WarehouseStorageType
import com.prapp.warehouse.utils.SharedPrefsManager

class StockByProductFragment : Fragment() {

    private val viewModel: AvailableStockViewModel by viewModels()

    private lateinit var spinnerWarehouse: Spinner
    private lateinit var inputProduct: TextInputEditText
    private lateinit var btnSearch: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textSuccess: TextView
    private lateinit var textResultsCount: TextView
    private lateinit var layoutResults: LinearLayout
    private lateinit var recyclerStock: RecyclerView

    // Move Modal
    private lateinit var layoutMoveModal: LinearLayout
    private lateinit var textMoveFrom: TextView
    private lateinit var inputDestBin: TextInputEditText
    private lateinit var spinnerMoveStorageType: Spinner
    private lateinit var inputMoveQty: TextInputEditText
    private lateinit var spinnerProcessType: Spinner
    private lateinit var btnMoveConfirm: Button
    private lateinit var btnMoveCancel: Button

    private var pendingMoveItem: WarehouseStockItem? = null
    private val warehouses = listOf("UKW1", "UKW2")
    private var storageTypesList: List<WarehouseStorageType> = emptyList()

    private val processTypes = listOf(
        "S012" to "Putaway (Distributive)",
        "S110" to "Putaway",
        "S201" to "Stock Removal for Production Supply",
        "S210" to "Picking",
        "S310" to "Replenishment",
        "S340" to "Packing",
        "S350" to "Move HU",
        "S400" to "Transfer Posting",
        "S401" to "Transfer Posting for Production Supply",
        "S410" to "Post to Unrestricted",
        "S420" to "Post to Scrap",
        "S425" to "Scrap / Sample Consumption",
        "S430" to "Posting Change in Storage Bin"
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_stock_by_product, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initViews(view)
        setupWarehouseSpinner()
        setupProcessTypeSpinner()
        setupObservers()

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener { findNavController().navigateUp() }
        view.findViewById<ImageView>(R.id.btn_home).setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        btnSearch.setOnClickListener { performSearch() }
        btnMoveCancel.setOnClickListener { hideMoveModal() }
        btnMoveConfirm.setOnClickListener { confirmMove() }
    }

    private fun initViews(view: View) {
        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        inputProduct = view.findViewById(R.id.input_product)
        btnSearch = view.findViewById(R.id.btn_search)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textSuccess = view.findViewById(R.id.text_success)
        textResultsCount = view.findViewById(R.id.text_results_count)
        layoutResults = view.findViewById(R.id.layout_results)
        recyclerStock = view.findViewById(R.id.recycler_stock)
        recyclerStock.layoutManager = LinearLayoutManager(requireContext())

        layoutMoveModal = view.findViewById(R.id.layout_move_modal)
        textMoveFrom = view.findViewById(R.id.text_move_from)
        inputDestBin = view.findViewById(R.id.input_dest_bin)
        spinnerMoveStorageType = view.findViewById(R.id.spinner_move_storage_type)
        inputMoveQty = view.findViewById(R.id.input_move_qty)
        spinnerProcessType = view.findViewById(R.id.spinner_process_type)
        btnMoveConfirm = view.findViewById(R.id.btn_move_confirm)
        btnMoveCancel = view.findViewById(R.id.btn_move_cancel)
    }

    private fun setupWarehouseSpinner() {
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouses)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = adapter
    }

    private fun setupProcessTypeSpinner() {
        val labels = processTypes.map { "${it.first} - ${it.second}" }
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerProcessType.adapter = adapter
        // Default to S400 (Transfer Posting)
        val defaultIdx = processTypes.indexOfFirst { it.first == "S400" }
        if (defaultIdx >= 0) spinnerProcessType.setSelection(defaultIdx)
    }

    private fun performSearch() {
        val warehouse = spinnerWarehouse.selectedItem?.toString() ?: ""
        val product = inputProduct.text.toString().trim().uppercase()

        textError.visibility = View.GONE
        textSuccess.visibility = View.GONE

        if (warehouse.isBlank()) { showError("Select a warehouse"); return }
        if (product.isBlank()) { showError("Enter a Product ID"); return }

        viewModel.fetchStorageTypes(warehouse)
        viewModel.searchByProduct(warehouse, product)
    }

    private fun openMoveModal(item: WarehouseStockItem) {
        pendingMoveItem = item
        val productLabel = item.product?.trimStart('0') ?: "?"
        val bin = item.ewmStorageBin ?: "?"
        val qty = item.availableEWMStockQty?.toDoubleOrNull() ?: 0.0
        val unit = item.ewmStockQuantityBaseUnit ?: ""
        textMoveFrom.text = "From: $productLabel  Bin: $bin  Qty: ${"%.0f".format(qty)} $unit"
        inputMoveQty.setText("%.0f".format(qty))
        inputDestBin.setText("")

        // Populate the storage type spinner for the move target
        val names = mutableListOf("(Auto-detect)")
        if (storageTypesList.isNotEmpty()) {
            names.addAll(storageTypesList.map { "${it.EWMStorageType} - ${it.EWMStorageTypeName ?: it.EWMStorageType}" })
        }
        val stAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, names)
        stAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerMoveStorageType.adapter = stAdapter

        layoutMoveModal.visibility = View.VISIBLE
    }

    private fun hideMoveModal() {
        layoutMoveModal.visibility = View.GONE
        pendingMoveItem = null
    }

    private fun confirmMove() {
        val item = pendingMoveItem ?: return
        val destBin = inputDestBin.text.toString().trim().uppercase()
        val qty = inputMoveQty.text.toString().toDoubleOrNull() ?: 0.0

        if (destBin.isBlank()) { showError("Enter a destination bin"); return }
        if (qty <= 0) { showError("Enter a valid quantity"); return }

        val warehouse = spinnerWarehouse.selectedItem?.toString() ?: ""
        val processTypePair = processTypes.getOrNull(spinnerProcessType.selectedItemPosition)
        val processType = processTypePair?.first ?: "S400"

        val destTypeIdx = spinnerMoveStorageType.selectedItemPosition
        val destStorageType = if (destTypeIdx > 0) storageTypesList.getOrNull(destTypeIdx - 1)?.EWMStorageType ?: "" else ""

        hideMoveModal()

        viewModel.createStockMoveTask(
            warehouse = warehouse,
            processType = processType,
            sourceItem = item,
            destBin = destBin,
            destStorageType = destStorageType,
            quantity = qty
        )
    }

    private fun setupObservers() {
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            progressBar.visibility = if (loading) View.VISIBLE else View.GONE
            btnSearch.isEnabled = !loading
            btnMoveConfirm.isEnabled = !loading
        }

        viewModel.error.observe(viewLifecycleOwner) { msg ->
            if (msg != null) {
                showError(msg)
                viewModel.clearError()
            }
        }

        viewModel.taskCreated.observe(viewLifecycleOwner) { msg ->
            if (msg != null) {
                textSuccess.text = msg
                textSuccess.visibility = View.VISIBLE
                viewModel.clearTaskCreated()
                // Refresh stock results
                val warehouse = spinnerWarehouse.selectedItem?.toString() ?: ""
                val product = inputProduct.text.toString().trim().uppercase()
                if (product.isNotBlank()) viewModel.searchByProduct(warehouse, product)
            }
        }

        viewModel.storageTypes.observe(viewLifecycleOwner) { types ->
            storageTypesList = types
        }

        viewModel.stockItems.observe(viewLifecycleOwner) { items ->
            if (items == null) return@observe
            textSuccess.visibility = View.GONE
            layoutResults.visibility = if (items.isNotEmpty()) View.VISIBLE else View.GONE
            if (items.isEmpty()) {
                showError("No stock found for this product")
                return@observe
            }
            val binCount = items.mapNotNull { it.ewmStorageBin }.toSet().size
            textResultsCount.text = "${items.size} record(s) across $binCount bin(s)"
            recyclerStock.adapter = StockItemAdapter(items) { clickedItem ->
                openMoveModal(clickedItem)
            }
        }
    }

    private fun showError(msg: String) {
        textError.text = msg
        textError.visibility = View.VISIBLE
    }
}
