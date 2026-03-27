package com.prapp.warehouse.ui.goodsissue

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
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

class GoodsIssueDetailFragment : Fragment() {

    private lateinit var viewModel: GoodsIssueViewModel
    private lateinit var adapter: ODItemAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var odHeader: TextView
    private lateinit var btnPost: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_goods_issue_detail, container, false)
        
        viewModel = ViewModelProvider(requireActivity())[GoodsIssueViewModel::class.java]
        
        odHeader = view.findViewById(R.id.text_od_header)
        progressBar = view.findViewById(R.id.progress_detail)
        btnPost = view.findViewById(R.id.btn_post_gi)
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_od_items)
        
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        adapter = ODItemAdapter()
        
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter
        
        viewModel.selectedOD.observe(viewLifecycleOwner) { od ->
            if (od != null) {
                odHeader.text = "OD: ${od.deliveryDocument}"
                viewModel.fetchODItems(od.deliveryDocument)
            }
        }
        
        viewModel.odItems.observe(viewLifecycleOwner) { result ->
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
        
        viewModel.actionStatus.observe(viewLifecycleOwner) { result ->
            if (result == null) return@observe
            
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnPost.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    Toast.makeText(context, result.data, Toast.LENGTH_LONG).show()
                    viewModel.resetActionStatus()
                    requireActivity().onBackPressedDispatcher.onBackPressed()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnPost.isEnabled = true
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                    viewModel.resetActionStatus()
                }
            }
        }
        
        btnPost.setOnClickListener {
             val od = viewModel.selectedOD.value
             val items = adapter.getItems()
             
             if (od != null && items.isNotEmpty()) {
                 viewModel.postGoodsIssue(od.deliveryDocument, items)
             }
        }
        
        return view
    }
}
