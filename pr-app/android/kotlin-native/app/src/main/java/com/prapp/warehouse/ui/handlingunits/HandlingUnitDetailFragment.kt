package com.prapp.warehouse.ui.handlingunits

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class HandlingUnitDetailFragment : Fragment() {

    private lateinit var viewModel: HandlingUnitDetailViewModel
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textHuId: TextView
    private lateinit var textPlant: TextView
    private lateinit var textSloc: TextView
    private lateinit var textMaterial: TextView
    private lateinit var btnDelete: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_handling_unit_detail, container, false)
        
        viewModel = ViewModelProvider(this)[HandlingUnitDetailViewModel::class.java]
        
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textHuId = view.findViewById(R.id.text_hu_id)
        textPlant = view.findViewById(R.id.text_plant)
        textSloc = view.findViewById(R.id.text_sloc)
        textMaterial = view.findViewById(R.id.text_material)
        btnDelete = view.findViewById(R.id.btn_delete_hu)
        
        val huId = arguments?.getString("huId") ?: ""
        textHuId.text = huId
        
        if (huId.isNotBlank()) {
            viewModel.fetchDetails(huId)
        }
        
        btnDelete.setOnClickListener {
            viewModel.deleteHandlingUnit(huId)
        }
        
        val recyclerView = view.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.recycler_hu_items)
        val adapter = HandlingUnitItemAdapter()
        recyclerView.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(requireContext())
        recyclerView.adapter = adapter

        viewModel.huDetail.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    textError.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val detail = result.data
                    if (detail != null && detail.isNotEmpty()) {
                        val hu = detail[0]
                        textPlant.text = "Plant: ${hu.plant ?: "N/A"}"
                        textSloc.text = "Storage Loc: ${hu.storageLocation ?: "N/A"}"
                        textMaterial.text = "Material: ${hu.packagingMaterial ?: "N/A"}"
                        
                        // Delete logic
                        val itemsList = hu.handlingUnitItems ?: emptyList()
                        adapter.submitList(itemsList)
                        
                        btnDelete.isEnabled = itemsList.isEmpty()
                        if (itemsList.isEmpty()) {
                            btnDelete.text = "Delete Handling Unit"
                        } else {
                            btnDelete.text = "Cannot Delete HU (Not Empty)"
                        }
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    textError.visibility = View.VISIBLE
                    textError.text = result.message
                }
            }
        }

        viewModel.deleteResult.observe(viewLifecycleOwner) { deleteRes ->
            when (deleteRes) {
                 is NetworkResult.Loading -> progressBar.visibility = View.VISIBLE
                 is NetworkResult.Success -> {
                     progressBar.visibility = View.GONE
                     Toast.makeText(requireContext(), "HU Deleted", Toast.LENGTH_SHORT).show()
                     findNavController().popBackStack()
                 }
                 is NetworkResult.Error -> {
                     progressBar.visibility = View.GONE
                     Toast.makeText(requireContext(), deleteRes.message, Toast.LENGTH_LONG).show()
                 }
            }
        }
        
        return view
    }
}
