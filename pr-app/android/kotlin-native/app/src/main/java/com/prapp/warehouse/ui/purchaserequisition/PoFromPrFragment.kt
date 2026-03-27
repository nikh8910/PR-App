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
import com.google.gson.Gson
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseRequisition
import com.prapp.warehouse.utils.NetworkResult

class PoFromPrFragment : Fragment() {

    private val viewModel: PoFromPrViewModel by viewModels()

    private var prJson: String? = null
    private var purchaseRequisition: PurchaseRequisition? = null

    private lateinit var tvPrRef: TextView
    private lateinit var etSupplier: EditText
    private lateinit var btnSubmit: Button
    private lateinit var progressBar: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prJson = arguments?.getString("PR_JSON")
        if (prJson != null) {
            purchaseRequisition = Gson().fromJson(prJson, PurchaseRequisition::class.java)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_po_from_pr, container, false)
        
        tvPrRef = view.findViewById(R.id.tv_pr_ref)
        etSupplier = view.findViewById(R.id.et_supplier)
        btnSubmit = view.findViewById(R.id.btn_submit)
        progressBar = view.findViewById(R.id.progress_bar)

        val prNumber = purchaseRequisition?.PurchaseRequisition ?: "Unknown"
        tvPrRef.text = "From PR: $prNumber"

        view.findViewById<ImageButton>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        view.findViewById<ImageButton>(R.id.btn_scan_supplier).setOnClickListener {
            Toast.makeText(requireContext(), "Scan Supplier", Toast.LENGTH_SHORT).show()
        }

        btnSubmit.setOnClickListener {
            val supplier = etSupplier.text.toString().trim()
            if (supplier.isBlank()) {
                Toast.makeText(requireContext(), "Supplier ID is required.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (purchaseRequisition != null) {
                viewModel.convertToPo(purchaseRequisition!!, supplier)
            } else {
                Toast.makeText(requireContext(), "Invalid Purchase Requisition Data.", Toast.LENGTH_SHORT).show()
            }
        }

        setupObservers()

        return view
    }

    private fun setupObservers() {
        viewModel.creationResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnSubmit.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnSubmit.isEnabled = true
                    val poNumber = result.data
                    Toast.makeText(requireContext(), "Purchase Order $poNumber created successfully!", Toast.LENGTH_LONG).show()
                    viewModel.resetResult()
                    // Navigate back twice (to PR List)
                    findNavController().popBackStack(R.id.prListFragment, false)
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnSubmit.isEnabled = true
                    Toast.makeText(requireContext(), "Error: ${result.message}", Toast.LENGTH_LONG).show()
                }
                else -> {}
            }
        }
    }
}
