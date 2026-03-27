package com.prapp.warehouse.ui.physicalinventory

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.ImageView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class PhysicalInventoryDetailFragment : Fragment() {

    private lateinit var viewModel: PhysicalInventoryViewModel
    private lateinit var adapter: PIItemAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var piHeader: TextView

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_physical_inventory_detail, container, false)
        
        viewModel = ViewModelProvider(requireActivity())[PhysicalInventoryViewModel::class.java]
        
        piHeader = view.findViewById(R.id.text_pi_header)
        progressBar = view.findViewById(R.id.progress_detail)
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_pi_items)
        
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        adapter = PIItemAdapter { item, qty ->
            viewModel.postCount(item, qty)
        }
        
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter
        
        viewModel.selectedDoc.observe(viewLifecycleOwner) { doc ->
            if (doc != null) {
                piHeader.text = "PI Doc: ${doc.piDocument} (${doc.fiscalYear})"
                viewModel.fetchPIItems(doc.piDocument, doc.fiscalYear)
            }
        }
        
        viewModel.piItems.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    adapter.submitList(result.data ?: emptyList())
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
        
        viewModel.countPostResult.observe(viewLifecycleOwner) { result ->
            if (result == null) return@observe
            
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(context, result.data, Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                }
            }
        }
        
        return view
    }
}
