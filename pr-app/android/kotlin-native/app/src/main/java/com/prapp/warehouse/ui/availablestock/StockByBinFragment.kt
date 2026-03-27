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

class StockByBinFragment : Fragment() {

    private val viewModel: AvailableStockViewModel by viewModels()

    private lateinit var spinnerWarehouse: Spinner
    private lateinit var spinnerStorageType: Spinner
    private lateinit var inputBin: TextInputEditText
    private lateinit var btnSearch: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textResultsCount: TextView
    private lateinit var layoutResults: LinearLayout
    private lateinit var recyclerStock: RecyclerView

    private val warehouses = listOf("UKW1", "UKW2")
    private var storageTypesList: List<WarehouseStorageType> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_stock_by_bin, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initViews(view)
        setupWarehouseSpinner()
        setupObservers()

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener { findNavController().navigateUp() }
        view.findViewById<ImageView>(R.id.btn_home).setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        btnSearch.setOnClickListener { performSearch() }
    }

    private fun initViews(view: View) {
        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        spinnerStorageType = view.findViewById(R.id.spinner_storage_type)
        inputBin = view.findViewById(R.id.input_bin)
        btnSearch = view.findViewById(R.id.btn_search)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textResultsCount = view.findViewById(R.id.text_results_count)
        layoutResults = view.findViewById(R.id.layout_results)
        recyclerStock = view.findViewById(R.id.recycler_stock)
        recyclerStock.layoutManager = LinearLayoutManager(requireContext())
    }

    private fun setupWarehouseSpinner() {
        val prefs = SharedPrefsManager(requireContext())
        val saved = prefs.getUsername() ?: "UKW2"
        val whList = warehouses + listOf(saved).filter { it !in warehouses }
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, whList)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = adapter

        val storageTypeNames = mutableListOf("All Storage Types")
        val stAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, storageTypeNames)
        stAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerStorageType.adapter = stAdapter
    }

    private fun performSearch() {
        val warehouse = spinnerWarehouse.selectedItem?.toString() ?: ""
        val bin = inputBin.text.toString().trim()
        val selectedType = spinnerStorageType.selectedItemPosition
        val storageType = if (selectedType > 0) storageTypesList.getOrNull(selectedType - 1)?.EWMStorageType else null

        textError.visibility = View.GONE
        if (warehouses.isEmpty() || warehouse.isBlank()) {
            showError("Select a warehouse")
            return
        }
        if (bin.isBlank()) {
            showError("Enter a storage bin")
            return
        }

        // Load storage types if not yet loaded
        if (storageTypesList.isEmpty()) {
            viewModel.fetchStorageTypes(warehouse)
        }

        viewModel.searchByBin(warehouse, bin, storageType)
    }

    private fun setupObservers() {
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            progressBar.visibility = if (loading) View.VISIBLE else View.GONE
            btnSearch.isEnabled = !loading
        }

        viewModel.error.observe(viewLifecycleOwner) { msg ->
            if (msg != null) {
                showError(msg)
                viewModel.clearError()
            }
        }

        viewModel.storageTypes.observe(viewLifecycleOwner) { types ->
            storageTypesList = types
            val names = mutableListOf("All Storage Types")
            names.addAll(types.map { "${it.EWMStorageType} - ${it.EWMStorageTypeName ?: it.EWMStorageType}" })
            val a = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, names)
            a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            spinnerStorageType.adapter = a
        }

        viewModel.stockItems.observe(viewLifecycleOwner) { items ->
            if (items == null) return@observe
            layoutResults.visibility = if (items.isNotEmpty()) View.VISIBLE else View.GONE
            if (items.isEmpty()) {
                showError("No stock found in this bin")
                return@observe
            }
            textResultsCount.text = "${items.size} stock record(s) found"
            recyclerStock.adapter = StockItemAdapter(items, onMoveClick = null)
        }
    }

    private fun showError(msg: String) {
        textError.text = msg
        textError.visibility = View.VISIBLE
    }
}

/**
 * Compact RecyclerView adapter for WarehouseStockItem list rows.
 * Used by both StockByBin and StockByProduct fragments.
 *
 * @param onMoveClick Optional. If not null, a "Move" button appears on each row for stock moves.
 */
class StockItemAdapter(
    private val items: List<WarehouseStockItem>,
    private val onMoveClick: ((WarehouseStockItem) -> Unit)?
) : RecyclerView.Adapter<StockItemAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val textProduct: TextView = view.findViewById(R.id.text_product)
        val textBin: TextView = view.findViewById(R.id.text_bin)
        val textQty: TextView = view.findViewById(R.id.text_qty)
        val textMeta: TextView = view.findViewById(R.id.text_meta)
        val btnMove: Button = view.findViewById(R.id.btn_move)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_stock_available, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.textProduct.text = item.product?.trimStart('0') ?: "Unknown"
        holder.textBin.text = "${item.ewmStorageBin ?: "?"} (${item.ewmStorageType ?: "-"})"
        val qty = item.availableEWMStockQty?.toDoubleOrNull()
            ?: item.ewmStockQuantityInBaseUnit?.toDoubleOrNull()
            ?: 0.0
        holder.textQty.text = "%.0f %s".format(qty, item.ewmStockQuantityBaseUnit ?: "")

        val metaParts = listOfNotNull(
            item.batch?.takeIf { it.isNotBlank() }?.let { "Batch: $it" },
            item.handlingUnitExternalID?.takeIf { it.isNotBlank() && !it.matches(Regex("^0+$")) }?.let { "HU: $it" },
            item.ewmStockType?.takeIf { it.isNotBlank() }?.let { "Type: $it" }
        )
        holder.textMeta.text = metaParts.joinToString(" | ")
        holder.textMeta.visibility = if (metaParts.isEmpty()) View.GONE else View.VISIBLE

        if (onMoveClick != null) {
            holder.btnMove.visibility = View.VISIBLE
            holder.btnMove.setOnClickListener { onMoveClick.invoke(item) }
        } else {
            holder.btnMove.visibility = View.GONE
        }
    }

    override fun getItemCount() = items.size
}
