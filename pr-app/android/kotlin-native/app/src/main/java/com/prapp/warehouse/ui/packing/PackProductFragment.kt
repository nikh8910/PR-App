package com.prapp.warehouse.ui.packing

import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.textfield.TextInputEditText
import com.prapp.warehouse.R

/**
 * PackProductFragment — mirrors PackProduct.jsx.
 * Pack a product (Product ID or GTIN) into a destination HU.
 * GTIN resolution: 8–14 digit numeric strings → tries to pack with product ID directly.
 */
class PackProductFragment : Fragment(R.layout.fragment_pack_product) {

    private val viewModel: PackingViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val spinnerWarehouse = view.findViewById<Spinner>(R.id.spinner_warehouse)
        val inputProduct = view.findViewById<TextInputEditText>(R.id.input_product)
        val inputQty = view.findViewById<TextInputEditText>(R.id.input_quantity)
        val inputUnit = view.findViewById<TextInputEditText>(R.id.input_unit)
        val inputBatch = view.findViewById<TextInputEditText>(R.id.input_batch)
        val inputDestHU = view.findViewById<TextInputEditText>(R.id.input_dest_hu)
        val btnPack = view.findViewById<Button>(R.id.btn_pack)
        val progressBar = view.findViewById<ProgressBar>(R.id.progress_bar)
        val textError = view.findViewById<TextView>(R.id.text_error)
        val textSuccess = view.findViewById<TextView>(R.id.text_success)

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener { findNavController().popBackStack() }
        view.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        // Warehouse spinner — static options
        val warehouseOptions = listOf("UKW2", "UKW1", "UKW3")
        spinnerWarehouse.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouseOptions)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        // Observers
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            progressBar.visibility = if (loading) View.VISIBLE else View.GONE
            btnPack.isEnabled = !loading
        }
        viewModel.error.observe(viewLifecycleOwner) { err ->
            if (!err.isNullOrBlank()) { textError.text = err; textError.visibility = View.VISIBLE }
            else textError.visibility = View.GONE
        }
        viewModel.successMsg.observe(viewLifecycleOwner) { msg ->
            if (!msg.isNullOrBlank()) { textSuccess.text = msg; textSuccess.visibility = View.VISIBLE }
            else textSuccess.visibility = View.GONE
        }

        btnPack.setOnClickListener {
            val warehouse = spinnerWarehouse.selectedItem as? String ?: ""
            val productRaw = inputProduct.text?.toString()?.trim()?.uppercase() ?: ""
            val qtyStr = inputQty.text?.toString()?.trim() ?: ""
            val unit = inputUnit.text?.toString()?.trim().takeIf { it?.isNotBlank() == true } ?: "EA"
            val batch = inputBatch.text?.toString()?.trim().takeIf { it?.isNotBlank() == true }
            val destHU = inputDestHU.text?.toString()?.trim()?.uppercase() ?: ""

            if (warehouse.isBlank()) { textError.text = "Select a warehouse."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (productRaw.isBlank()) { textError.text = "Enter a product."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            val qty = qtyStr.toDoubleOrNull()
            if (qty == null || qty <= 0) { textError.text = "Enter a valid quantity."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (destHU.isBlank()) { textError.text = "Enter destination HU."; textError.visibility = View.VISIBLE; return@setOnClickListener }

            viewModel.clearError(); viewModel.clearSuccess()
            // GTIN-style inputs (pure digits 8-14) are passed as-is; SAP handles GTIN-to-product mapping internally
            viewModel.packProductToHU(warehouse, destHU, productRaw, qty, unit, batch)
            inputProduct.setText(""); inputQty.setText(""); inputBatch.setText(""); inputDestHU.setText("")
        }
    }
}
