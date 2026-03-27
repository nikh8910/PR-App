package com.prapp.warehouse.ui.goodsreceipt

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
import androidx.navigation.fragment.findNavController
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class GoodsReceiptDetailFragment : Fragment() {

    private lateinit var viewModel: GoodsReceiptViewModel
    private lateinit var adapter: POItemAdapter
    private lateinit var progressBar: ProgressBar
    private lateinit var textPoHeader: TextView
    private lateinit var textPoSupplier: TextView
    private lateinit var textPostStatus: TextView
    private lateinit var btnPost: Button
    private lateinit var editHeaderText: EditText
    private lateinit var spinnerMovementType: Spinner

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_goods_receipt_detail, container, false)

        // Share ViewModel with parent fragment/activity to get selected PO
        viewModel = ViewModelProvider(requireActivity())[GoodsReceiptViewModel::class.java]

        textPoHeader = view.findViewById(R.id.text_po_header)
        textPoSupplier = view.findViewById(R.id.text_po_supplier)
        textPostStatus = view.findViewById(R.id.text_post_status)
        progressBar = view.findViewById(R.id.progress_detail)
        btnPost = view.findViewById(R.id.btn_post_gr)
        editHeaderText = view.findViewById(R.id.edit_header_text)
        spinnerMovementType = view.findViewById(R.id.spinner_movement_type)
        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_po_items)
        
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        // Setup movement type spinner
        val movements = listOf("101 - GR for PO", "103 - GR Blocked Stock")
        val spinnerAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, movements)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerMovementType.adapter = spinnerAdapter

        adapter = POItemAdapter { /* item click if needed */ }
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter

        viewModel.selectedPO.observe(viewLifecycleOwner) { po ->
            if (po != null) {
                textPoHeader.text = "PO: ${po.purchaseOrder}"
                textPoSupplier.text = "Vendor: ${po.supplier ?: "—"}"
            }
        }

        viewModel.poItems.observe(viewLifecycleOwner) { result ->
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
                    btnPost.isEnabled = false
                    Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
                }
            }
        }

        viewModel.postResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    btnPost.isEnabled = false
                    btnPost.text = "Posting..."
                    textPostStatus.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    btnPost.isEnabled = true
                    btnPost.text = "Post Goods Receipt"
                    textPostStatus.visibility = View.VISIBLE
                    textPostStatus.setTextColor(resources.getColor(android.R.color.holo_green_dark, null))
                    textPostStatus.text = result.data ?: "Posted successfully!"
                    Toast.makeText(context, result.data ?: "Posted!", Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                    // Reload PO items to reflect updated quantities
                    viewModel.selectedPO.value?.let { po ->
                        viewModel.fetchPOItems(po.purchaseOrder ?: "")
                    }
                }
                is NetworkResult.Error -> {
                    btnPost.isEnabled = true
                    btnPost.text = "Post Goods Receipt"
                    textPostStatus.visibility = View.VISIBLE
                    textPostStatus.setTextColor(resources.getColor(android.R.color.holo_red_dark, null))
                    textPostStatus.text = "Error: ${result.message}"
                    Toast.makeText(context, "Error: ${result.message}", Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                }
                null -> { /* No-op */ }
            }
        }

        btnPost.setOnClickListener {
            val selectedMovementType = if (spinnerMovementType.selectedItemPosition == 0) "101" else "103"
            viewModel.setMovementType(selectedMovementType)
            viewModel.setHeaderText(editHeaderText.text.toString())
            val items = adapter.getItems()
            viewModel.postGoodsReceipt(items)
        }

        return view
    }
}
