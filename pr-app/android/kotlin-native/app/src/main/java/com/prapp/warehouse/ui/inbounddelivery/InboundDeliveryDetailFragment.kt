package com.prapp.warehouse.ui.inbounddelivery

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.widget.ImageView
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class InboundDeliveryDetailFragment : Fragment() {

    private lateinit var viewModel: InboundDeliveryViewModel
    private lateinit var adapter: IBDItemAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var ibdHeader: TextView
    private lateinit var btnPost: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_inbound_delivery_detail, container, false)
        
        viewModel = ViewModelProvider(requireActivity())[InboundDeliveryViewModel::class.java]
        
        ibdHeader = view.findViewById(R.id.text_ibd_header)
        progressBar = view.findViewById(R.id.progress_detail)
        btnPost = view.findViewById(R.id.btn_post_gr)
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_ibd_items)
        
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        adapter = IBDItemAdapter { item ->
            // Update logic is handled inside adapter via text watchers for now
        }
        
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter
        
        viewModel.selectedIBD.observe(viewLifecycleOwner) { ibd ->
            if (ibd != null) {
                ibdHeader.text = "IBD: ${ibd.deliveryDocument}"
                viewModel.fetchIBDItems(ibd.deliveryDocument)
            }
        }
        
        viewModel.ibdItems.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnPost.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    adapter.submitList(result.data ?: emptyList())
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
        
        viewModel.postResult.observe(viewLifecycleOwner) { result ->
            if (result == null) return@observe
            
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnPost.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    Toast.makeText(context, "GR Posted Successfully!", Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                    // Navigate back
                    requireActivity().onBackPressedDispatcher.onBackPressed()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                }
            }
        }
        
        btnPost.setOnClickListener {
             val ibd = viewModel.selectedIBD.value
             if (ibd != null) {
                 viewModel.postGoodsReceiptForIBD(ibd.deliveryDocument)
             }
        }
        
        return view
    }
}
