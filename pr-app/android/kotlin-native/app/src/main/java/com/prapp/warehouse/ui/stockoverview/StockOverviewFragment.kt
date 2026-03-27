package com.prapp.warehouse.ui.stockoverview

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.ImageView
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class StockOverviewFragment : Fragment() {

    private lateinit var viewModel: StockViewModel
    private lateinit var adapter: StockAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var inputMaterial: EditText
    private lateinit var inputPlant: EditText
    private lateinit var inputSloc: EditText
    private lateinit var btnSearch: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_stock_overview, container, false)
        
        viewModel = ViewModelProvider(this)[StockViewModel::class.java]
        
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_stock_list)
        progressBar = view.findViewById(R.id.progress_bar)
        errorText = view.findViewById(R.id.text_error)
        
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        inputMaterial = view.findViewById(R.id.input_material)
        inputPlant = view.findViewById(R.id.input_plant)
        inputSloc = view.findViewById(R.id.input_sloc)
        btnSearch = view.findViewById(R.id.btn_search)
        
        adapter = StockAdapter()
        
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter
        
        btnSearch.setOnClickListener { performSearch() }
        
        inputSloc.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                performSearch()
                true
            } else {
                false
            }
        }
        
        viewModel.stockList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    errorText.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    if (result.data.isNullOrEmpty()) {
                        errorText.visibility = View.VISIBLE
                        errorText.text = "No Stock found"
                        adapter.submitList(emptyList()) // Clear list
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

    private fun performSearch() {
        val material = inputMaterial.text.toString()
        val plant = inputPlant.text.toString()
        val sloc = inputSloc.text.toString()
        viewModel.fetchStock(material, plant, sloc)
    }
}
