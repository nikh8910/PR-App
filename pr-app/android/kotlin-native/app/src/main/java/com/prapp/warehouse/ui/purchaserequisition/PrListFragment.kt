package com.prapp.warehouse.ui.purchaserequisition

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
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

class PrListFragment : Fragment() {

    private val viewModel: PrListViewModel by viewModels()
    private lateinit var prAdapter: PrAdapter
    private var prList: List<com.prapp.warehouse.data.models.PurchaseRequisition> = emptyList()

    private lateinit var etSearchDocument: EditText
    private lateinit var btnSearch: Button
    private lateinit var btnCreateNew: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvPrCount: TextView
    private lateinit var tvPrTotal: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_pr_list, container, false)

        etSearchDocument = view.findViewById(R.id.et_search_document)
        btnSearch = view.findViewById(R.id.btn_search)
        btnCreateNew = view.findViewById(R.id.btn_create_new)
        progressBar = view.findViewById(R.id.progress_bar)
        tvPrCount = view.findViewById(R.id.tv_pr_count)
        tvPrTotal = view.findViewById(R.id.tv_pr_total)

        val rvPrList: RecyclerView = view.findViewById(R.id.rv_purchase_requisitions)
        rvPrList.layoutManager = LinearLayoutManager(requireContext())
        prAdapter = PrAdapter { pr ->
            val bundle = Bundle().apply {
                putString("PR_NUMBER", pr.PurchaseRequisition)
            }
            findNavController().navigate(R.id.action_prList_to_detail, bundle)
        }
        rvPrList.adapter = prAdapter

        view.findViewById<ImageButton>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        view.findViewById<ImageButton>(R.id.btn_home).setOnClickListener {
            // Wait, we can navigate directly to back multiple times, but easiest is navigating to dashboard
            findNavController().navigateUp()
        }

        btnSearch.setOnClickListener {
            val searchTerm = etSearchDocument.text.toString()
            viewModel.fetchPRs(if (searchTerm.isNotBlank()) searchTerm else null)
        }

        btnCreateNew.setOnClickListener {
            findNavController().navigate(R.id.action_prList_to_create)
        }

        setupObservers()

        // Fetch initial list
        viewModel.fetchPRs()

        return view
    }

    private fun setupObservers() {
        viewModel.prs.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    prList = result.data ?: emptyList()
                    prAdapter.submitList(prList)
                    val count = prList.size
                    tvPrCount.text = count.toString()
                    tvPrTotal.text = "/$count"
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    tvPrCount.text = "0"
                    tvPrTotal.text = "/0"
                    prAdapter.submitList(emptyList())
                    Toast.makeText(requireContext(), "Error: ${result.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
