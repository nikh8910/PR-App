package com.prapp.warehouse.ui.packing

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.textfield.TextInputEditText
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.HandlingUnitItem

/**
 * HUTransferFragment — mirrors HUTransfer.jsx.
 * Loads source HU contents. Operator selects items + quantities to transfer to a destination HU.
 * Supports full and partial transfers via the repackHUItem API.
 */
class HUTransferFragment : Fragment(R.layout.fragment_hu_transfer) {

    private val viewModel: PackingViewModel by viewModels()
    private var sourceItems = listOf<HandlingUnitItem>()
    private val itemViewMap = mutableMapOf<Int, Triple<CheckBox, EditText, Double>>()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val spinnerWarehouse = view.findViewById<Spinner>(R.id.spinner_warehouse)
        val inputSourceHU = view.findViewById<TextInputEditText>(R.id.input_source_hu)
        val btnLoadHU = view.findViewById<Button>(R.id.btn_load_hu)
        val inputDestHU = view.findViewById<TextInputEditText>(R.id.input_dest_hu)
        val btnTransfer = view.findViewById<Button>(R.id.btn_transfer)
        val progressBar = view.findViewById<ProgressBar>(R.id.progress_bar)
        val progressItems = view.findViewById<ProgressBar>(R.id.progress_items)
        val textError = view.findViewById<TextView>(R.id.text_error)
        val textSuccess = view.findViewById<TextView>(R.id.text_success)
        val layoutSourceItems = view.findViewById<View>(R.id.layout_source_items)
        val containerItems = view.findViewById<LinearLayout>(R.id.container_items)
        val textSelectionCount = view.findViewById<TextView>(R.id.text_selection_count)
        val arrowIndicator = view.findViewById<TextView>(R.id.arrow_indicator)

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener { findNavController().popBackStack() }
        view.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        // Warehouse spinner
        val warehouseOptions = listOf("UKW2", "UKW1", "UKW3")
        spinnerWarehouse.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouseOptions)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        fun buildItemRows(items: List<HandlingUnitItem>) {
            containerItems.removeAllViews()
            itemViewMap.clear()
            items.forEachIndexed { i, item ->
                val maxQty = item.handlingUnitQuantity?.toDoubleOrNull() ?: 0.0
                val prod = (item.material ?: item.product ?: "?").trimStart('0')
                val unit = item.handlingUnitQuantityUnit ?: "EA"

                val row = LinearLayout(requireContext()).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(8, 8, 8, 8)
                    gravity = android.view.Gravity.CENTER_VERTICAL
                }
                val checkBox = CheckBox(requireContext()).apply { isChecked = true }
                val labelView = TextView(requireContext()).apply {
                    text = "#${i + 1}  $prod"
                    textSize = 12f
                    setTextColor(0xFF374151.toInt())
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    setPadding(8, 0, 8, 0)
                }
                val qtyInput = EditText(requireContext()).apply {
                    setText(maxQty.toInt().toString())
                    inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
                    textSize = 12f
                    layoutParams = LinearLayout.LayoutParams(140, LinearLayout.LayoutParams.WRAP_CONTENT)
                    gravity = android.view.Gravity.CENTER
                }
                val maxLabel = TextView(requireContext()).apply {
                    text = "/ ${maxQty.toInt()} $unit"
                    textSize = 10f
                    setTextColor(0xFF64748B.toInt())
                    setPadding(8, 0, 0, 0)
                }
                row.addView(checkBox); row.addView(labelView); row.addView(qtyInput); row.addView(maxLabel)
                containerItems.addView(row)
                itemViewMap[i] = Triple(checkBox, qtyInput, maxQty)
            }
            layoutSourceItems.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
            arrowIndicator.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
            textSelectionCount.text = "${items.size} item(s) in source HU"
            textSelectionCount.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
        }

        // Observers
        viewModel.sourceHUItems.observe(viewLifecycleOwner) { items ->
            progressItems.visibility = View.GONE
            sourceItems = items
            buildItemRows(items)
        }
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            progressBar.visibility = if (loading) View.VISIBLE else View.GONE
            btnTransfer.isEnabled = !loading
        }
        viewModel.error.observe(viewLifecycleOwner) { err ->
            if (!err.isNullOrBlank()) { textError.text = err; textError.visibility = View.VISIBLE }
            else textError.visibility = View.GONE
        }
        viewModel.successMsg.observe(viewLifecycleOwner) { msg ->
            if (!msg.isNullOrBlank()) { textSuccess.text = msg; textSuccess.visibility = View.VISIBLE }
            else textSuccess.visibility = View.GONE
        }

        btnLoadHU.setOnClickListener {
            val sourceHU = inputSourceHU.text?.toString()?.trim()?.uppercase() ?: ""
            if (sourceHU.isBlank()) { textError.text = "Enter source HU."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            progressItems.visibility = View.VISIBLE
            viewModel.loadHUContents(sourceHU)
        }

        btnTransfer.setOnClickListener {
            val warehouse = spinnerWarehouse.selectedItem as? String ?: ""
            val sourceHU = inputSourceHU.text?.toString()?.trim()?.uppercase() ?: ""
            val destHU = inputDestHU.text?.toString()?.trim()?.uppercase() ?: ""

            if (warehouse.isBlank()) { textError.text = "Select a warehouse."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (sourceHU.isBlank()) { textError.text = "Enter source HU."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (destHU.isBlank()) { textError.text = "Enter destination HU."; textError.visibility = View.VISIBLE; return@setOnClickListener }

            val itemsToTransfer = itemViewMap.entries.mapNotNull { (i, v) ->
                if (!v.first.isChecked) return@mapNotNull null
                val qty = v.second.text.toString().toDoubleOrNull() ?: 0.0
                if (qty <= 0) return@mapNotNull null
                Triple(sourceItems[i], qty, qty >= v.third)
            }

            if (itemsToTransfer.isEmpty()) {
                textError.text = "Select at least one item with qty > 0 to transfer."
                textError.visibility = View.VISIBLE; return@setOnClickListener
            }

            viewModel.clearError(); viewModel.clearSuccess()
            viewModel.repackHUItems(warehouse, sourceHU, destHU, itemsToTransfer)
        }
    }
}
