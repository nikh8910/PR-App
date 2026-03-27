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
import com.prapp.warehouse.utils.SharedPrefsManager

/**
 * CreateHUFragment — mirrors CreateHU.jsx.
 * Form to create a new empty EWM Handling Unit.
 * Fields: warehouse, packaging material, storage bin, plant (optional), storage location (optional).
 */
class CreateHUFragment : Fragment(R.layout.fragment_create_hu) {

    private val viewModel: PackingViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val spinnerWarehouse = view.findViewById<Spinner>(R.id.spinner_warehouse)
        val spinnerPlant = view.findViewById<Spinner>(R.id.spinner_plant)
        val spinnerStorageLoc = view.findViewById<Spinner>(R.id.spinner_storage_loc)
        val inputPackMat = view.findViewById<TextInputEditText>(R.id.input_packaging_material)
        val inputBin = view.findViewById<TextInputEditText>(R.id.input_storage_bin)
        val btnCreate = view.findViewById<Button>(R.id.btn_create)
        val progressBar = view.findViewById<ProgressBar>(R.id.progress_bar)
        val textError = view.findViewById<TextView>(R.id.text_error)
        val textSuccess = view.findViewById<TextView>(R.id.text_success)
        val layoutCreatedHU = view.findViewById<View>(R.id.layout_created_hu)
        val textCreatedHUId = view.findViewById<TextView>(R.id.text_created_hu_id)

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener { findNavController().popBackStack() }
        view.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }

        // Simple warehouse list — default UKW2 pre-selected
        val prefs = SharedPrefsManager(requireContext())
        val warehouseOptions = listOf("UKW2", "UKW1", "UKW3")
        spinnerWarehouse.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouseOptions)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        // Plant options — static common values
        val plantOptions = listOf("None", "20UK", "20US", "20DE")
        spinnerPlant.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, plantOptions)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
        spinnerPlant.setSelection(1) // Pre-select 20UK

        // Storage location — simple text values
        spinnerStorageLoc.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, listOf("(None)"))
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        // Observe ViewModel
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            progressBar.visibility = if (loading) View.VISIBLE else View.GONE
            btnCreate.isEnabled = !loading
        }
        viewModel.error.observe(viewLifecycleOwner) { err ->
            if (!err.isNullOrBlank()) { textError.text = err; textError.visibility = View.VISIBLE }
            else textError.visibility = View.GONE
        }
        viewModel.successMsg.observe(viewLifecycleOwner) { msg ->
            if (!msg.isNullOrBlank()) { textSuccess.text = msg; textSuccess.visibility = View.VISIBLE }
            else textSuccess.visibility = View.GONE
        }
        viewModel.createdHUId.observe(viewLifecycleOwner) { huId ->
            if (!huId.isNullOrBlank()) {
                textCreatedHUId.text = huId
                layoutCreatedHU.visibility = View.VISIBLE
            } else layoutCreatedHU.visibility = View.GONE
        }

        btnCreate.setOnClickListener {
            val warehouse = spinnerWarehouse.selectedItem as? String ?: ""
            val packMat = inputPackMat.text?.toString()?.trim() ?: ""
            val bin = inputBin.text?.toString()?.trim() ?: ""
            val plantSel = spinnerPlant.selectedItem as? String ?: ""
            val selectedPlant = if (plantSel == "None") null else plantSel

            if (warehouse.isBlank()) { textError.text = "Select a warehouse."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (packMat.isBlank()) { textError.text = "Enter a packaging material."; textError.visibility = View.VISIBLE; return@setOnClickListener }
            if (bin.isBlank()) { textError.text = "Enter a storage bin."; textError.visibility = View.VISIBLE; return@setOnClickListener }

            viewModel.clearError(); viewModel.clearSuccess()
            viewModel.createHandlingUnit(warehouse, packMat, bin, selectedPlant, null)
            inputPackMat.setText(""); inputBin.setText("")
        }
    }
}
