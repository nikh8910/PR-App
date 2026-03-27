package com.prapp.warehouse.ui.movestock

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.ImageView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class MoveStockFragment : Fragment() {

    private lateinit var viewModel: MoveStockViewModel
    private lateinit var progressBar: ProgressBar
    
    private lateinit var inputMaterial: EditText
    private lateinit var inputSourcePlant: EditText
    private lateinit var inputSourceSloc: EditText
    private lateinit var inputDestPlant: EditText
    private lateinit var inputDestSloc: EditText
    private lateinit var inputQty: EditText
    private lateinit var spinnerMvtType: Spinner
    private lateinit var btnExecute: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_move_stock, container, false)
        
        viewModel = ViewModelProvider(this)[MoveStockViewModel::class.java]
        
        progressBar = view.findViewById(R.id.progress_bar)
        inputMaterial = view.findViewById(R.id.input_material)
        inputSourcePlant = view.findViewById(R.id.input_source_plant)
        inputSourceSloc = view.findViewById(R.id.input_source_sloc)
        inputDestPlant = view.findViewById(R.id.input_dest_plant)
        inputDestSloc = view.findViewById(R.id.input_dest_sloc)
        inputQty = view.findViewById(R.id.input_qty)
        spinnerMvtType = view.findViewById(R.id.spinner_movement_type)
        btnExecute = view.findViewById(R.id.btn_move_stock)

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        // Setup Spinner
        val adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_spinner_item,
            listOf("311", "301") // SLoc-to-SLoc, Plant-to-Plant
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerMvtType.adapter = adapter
        
        btnExecute.setOnClickListener {
            val mvtType = spinnerMvtType.selectedItem.toString().take(3)
            viewModel.postStockMovement(
                material = inputMaterial.text.toString(),
                srcPlant = inputSourcePlant.text.toString(),
                srcSloc = inputSourceSloc.text.toString(),
                dstPlant = inputDestPlant.text.toString(),
                dstSloc = inputDestSloc.text.toString(),
                qty = inputQty.text.toString(),
                mvtType = mvtType
            )
        }

        viewModel.moveResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnExecute.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnExecute.isEnabled = true
                    Toast.makeText(requireContext(), result.data, Toast.LENGTH_LONG).show()
                    findNavController().popBackStack()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnExecute.isEnabled = true
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
        
        return view
    }
}
