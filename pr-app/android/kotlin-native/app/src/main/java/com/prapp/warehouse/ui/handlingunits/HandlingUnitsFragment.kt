package com.prapp.warehouse.ui.handlingunits

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class HandlingUnitsFragment : Fragment() {

    private lateinit var viewModel: HandlingUnitsViewModel
    private lateinit var adapter: HandlingUnitAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var inputHuId: EditText
    private lateinit var btnSearch: Button
    private lateinit var fabCreate: FloatingActionButton

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_handling_units, container, false)
        
        viewModel = ViewModelProvider(this)[HandlingUnitsViewModel::class.java]
        
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_hu_list)
        progressBar = view.findViewById(R.id.progress_bar)
        errorText = view.findViewById(R.id.text_error)
        
        inputHuId = view.findViewById(R.id.input_hu_id)
        btnSearch = view.findViewById(R.id.btn_search)
        fabCreate = view.findViewById(R.id.fab_create_hu)
        
        adapter = HandlingUnitAdapter { selectedHu ->
            // Pass HU ID to details fragment
            val bundle = Bundle().apply {
                putString("huId", selectedHu.handlingUnitExternalID)
            }
            findNavController().navigate(R.id.action_handlingUnits_to_detail, bundle)
        }
        
        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = adapter
        
        btnSearch.setOnClickListener {
            val huId = inputHuId.text.toString()
            viewModel.fetchHandlingUnits(huId, "", "")
        }
        
        fabCreate.setOnClickListener {
            showCreateHuDialog()
        }
        
        viewModel.createResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> progressBar.visibility = View.VISIBLE
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), "HU Created: ${result.data?.handlingUnitExternalID}", Toast.LENGTH_LONG).show()
                    // Re-fetch list
                    val currentHuId = inputHuId.text.toString()
                    viewModel.fetchHandlingUnits(currentHuId, "", "")
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
        
        viewModel.huList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    errorText.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    if (result.data.isNullOrEmpty()) {
                        errorText.visibility = View.VISIBLE
                        errorText.text = "No Handling Units found."
                        adapter.submitList(emptyList())
                    } else {
                        errorText.visibility = View.GONE
                        adapter.submitList(result.data ?: emptyList())
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    errorText.visibility = View.VISIBLE
                    errorText.text = result.message
                }
            }
        }
        
        return view
    }

    private fun showCreateHuDialog() {
        val dialogView = LayoutInflater.from(requireContext()).inflate(R.layout.dialog_create_hu, null)
        val inputMaterial = dialogView.findViewById<EditText>(R.id.input_pm_material)
        val inputPlant = dialogView.findViewById<EditText>(R.id.input_pm_plant)
        val inputSloc = dialogView.findViewById<EditText>(R.id.input_pm_sloc)

        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Create Handling Unit")
            .setView(dialogView)
            .setPositiveButton("Create") { _, _ ->
                val mat = inputMaterial.text.toString()
                val plant = inputPlant.text.toString()
                val sloc = inputSloc.text.toString()
                viewModel.createHandlingUnit(mat, plant, sloc)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
