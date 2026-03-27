package com.prapp.warehouse.ui.purchaserequisition

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class PrDetailFragment : Fragment() {

    private val viewModel: PrDetailViewModel by viewModels()
    private lateinit var prDetailAdapter: PrDetailAdapter

    private lateinit var tvPrTitle: TextView
    private lateinit var btnCreatePo: Button
    private lateinit var btnAddItem: Button
    private lateinit var progressBar: ProgressBar

    private var prNumber: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prNumber = arguments?.getString("PR_NUMBER")
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_pr_detail, container, false)

        tvPrTitle = view.findViewById(R.id.tv_pr_title)
        btnCreatePo = view.findViewById(R.id.btn_create_po)
        btnAddItem = view.findViewById(R.id.btn_add_item)
        progressBar = view.findViewById(R.id.progress_bar)

        tvPrTitle.text = "#${prNumber ?: "Unknown"}"

        val rvPrItems: RecyclerView = view.findViewById(R.id.rv_pr_items)
        rvPrItems.layoutManager = LinearLayoutManager(requireContext())
        prDetailAdapter = PrDetailAdapter()
        rvPrItems.adapter = prDetailAdapter

        view.findViewById<ImageButton>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        btnCreatePo.setOnClickListener {
            viewModel.prDetail.value?.let { result ->
                if (result is NetworkResult.Success) {
                    val pr = result.data
                    val jsonPayload = com.google.gson.Gson().toJson(pr)
                    val bundle = Bundle().apply { putString("PR_JSON", jsonPayload) }
                    findNavController().navigate(R.id.action_prDetail_to_convertPo, bundle)
                } else {
                    Toast.makeText(requireContext(), "PR Data not loaded yet", Toast.LENGTH_SHORT).show()
                }
            } ?: run {
                Toast.makeText(requireContext(), "PR Data not loaded yet", Toast.LENGTH_SHORT).show()
            }
        }
        
        btnAddItem.setOnClickListener {
            prNumber?.let { num ->
                val bundle = Bundle().apply { putString("PR_NUMBER", num) }
                findNavController().navigate(R.id.action_prDetail_to_createItem, bundle)
            }
        }

        setupObservers()

        prNumber?.let { num ->
            viewModel.fetchPrDetail(num)
        }

        return view
    }

    private fun setupObservers() {
        viewModel.prDetail.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val items = result.data?._PurchaseRequisitionItem ?: emptyList()
                    prDetailAdapter.submitList(items)
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), "Error: ${result.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
