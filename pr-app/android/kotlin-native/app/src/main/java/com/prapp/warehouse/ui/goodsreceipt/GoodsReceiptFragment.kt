package com.prapp.warehouse.ui.goodsreceipt

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
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
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class GoodsReceiptFragment : Fragment() {

    private lateinit var viewModel: GoodsReceiptViewModel
    private lateinit var adapter: POListAdapter
    private lateinit var layoutFilter: ScrollView
    private lateinit var layoutList: LinearLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textResultCount: TextView
    private lateinit var editPoNumber: EditText
    private lateinit var editSupplier: EditText
    private lateinit var editDateFrom: TextView
    private lateinit var editDateTo: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_goods_receipt, container, false)

        viewModel = ViewModelProvider(requireActivity())[GoodsReceiptViewModel::class.java]

        // Bind views
        layoutFilter = view.findViewById(R.id.layout_filter)
        layoutList = view.findViewById(R.id.layout_list)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textResultCount = view.findViewById(R.id.text_result_count)
        editPoNumber = view.findViewById(R.id.edit_po_number)
        editSupplier = view.findViewById(R.id.edit_supplier)
        editDateFrom = view.findViewById(R.id.edit_date_from)
        editDateTo = view.findViewById(R.id.edit_date_to)

        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_po_list)
        adapter = POListAdapter { po ->
            viewModel.selectPO(po)
            viewModel.fetchPOItems(po.purchaseOrder ?: "")
            findNavController().navigate(R.id.action_goodsReceipt_to_detail)
        }
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter

        // Set default date range: last 90 days
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = Date()
        val ninetyDaysAgo = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -90) }.time
        editDateFrom.text = sdf.format(ninetyDaysAgo)
        editDateTo.text = sdf.format(today)

        // Search button
        view.findViewById<Button>(R.id.btn_search).setOnClickListener {
            val f = GoodsReceiptViewModel.GRFilters(
                poNumber = editPoNumber.text.toString().trim(),
                supplier = editSupplier.text.toString().trim(),
                dateFrom = editDateFrom.text.toString().trim(),
                dateTo = editDateTo.text.toString().trim()
            )
            if (f.poNumber.isEmpty() && f.supplier.isEmpty() && f.dateFrom.isEmpty()) {
                Toast.makeText(context, "Enter at least one filter (PO Number, Supplier, or Date From)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.setFilters(f)
            viewModel.fetchPurchaseOrders()
            showListView()
        }

        // Change filters button
        view.findViewById<TextView>(R.id.btn_change_filters).setOnClickListener {
            showFilterView()
        }
        
        // Back navigation
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        // Observe PO list
        viewModel.poList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    textError.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val list = result.data ?: emptyList()
                    textResultCount.text = "${list.size} PO${if (list.size != 1) "s" else ""} found"
                    if (list.isEmpty()) {
                        textError.visibility = View.VISIBLE
                        textError.text = "No Purchase Orders found for the given filters."
                    } else {
                        textError.visibility = View.GONE
                        adapter.submitList(list)
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    textError.visibility = View.VISIBLE
                    textError.text = result.message
                }
            }
        }

        return view
    }

    private fun showListView() {
        layoutFilter.visibility = View.GONE
        layoutList.visibility = View.VISIBLE
    }

    private fun showFilterView() {
        layoutList.visibility = View.GONE
        layoutFilter.visibility = View.VISIBLE
    }
}
