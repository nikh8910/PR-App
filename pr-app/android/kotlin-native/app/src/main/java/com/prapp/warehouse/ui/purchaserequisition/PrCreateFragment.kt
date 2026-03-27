package com.prapp.warehouse.ui.purchaserequisition

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseRequisition
import com.prapp.warehouse.data.models.PurchaseRequisitionItem
import com.prapp.warehouse.utils.NetworkResult

class PrCreateFragment : Fragment() {

    private val viewModel: PrCreateViewModel by viewModels()

    private var existingPrNumber: String? = null

    private lateinit var tvFormTitle: TextView
    private lateinit var layoutPrHeader: LinearLayout
    private lateinit var etPrDescription: EditText
    private lateinit var etMaterial: EditText
    private lateinit var etShortText: EditText
    private lateinit var etQuantity: EditText
    private lateinit var etUom: EditText
    private lateinit var etPlant: EditText
    private lateinit var etPrice: EditText
    private lateinit var btnSubmit: Button
    private lateinit var progressBar: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        existingPrNumber = arguments?.getString("PR_NUMBER")
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_pr_create, container, false)

        tvFormTitle = view.findViewById(R.id.tv_form_title)
        layoutPrHeader = view.findViewById(R.id.layout_pr_header)
        etPrDescription = view.findViewById(R.id.et_pr_description)
        etMaterial = view.findViewById(R.id.et_material)
        etShortText = view.findViewById(R.id.et_short_text)
        etQuantity = view.findViewById(R.id.et_quantity)
        etUom = view.findViewById(R.id.et_uom)
        etPlant = view.findViewById(R.id.et_plant)
        etPrice = view.findViewById(R.id.et_price)
        btnSubmit = view.findViewById(R.id.btn_submit)
        progressBar = view.findViewById(R.id.progress_bar)

        if (existingPrNumber != null) {
            tvFormTitle.text = "ADD ITEM TO #$existingPrNumber"
            layoutPrHeader.visibility = View.GONE
        } else {
            tvFormTitle.text = "CREATE PURCHASE REQUISITION"
            layoutPrHeader.visibility = View.VISIBLE
        }

        view.findViewById<ImageButton>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        view.findViewById<ImageButton>(R.id.btn_scan_material).setOnClickListener {
            Toast.makeText(requireContext(), "Scan Material", Toast.LENGTH_SHORT).show()
        }

        btnSubmit.setOnClickListener {
            submitForm()
        }

        setupObservers()

        return view
    }

    private fun submitForm() {
        val material = etMaterial.text.toString().trim()
        val shortText = etShortText.text.toString().trim()
        val quantity = etQuantity.text.toString().trim().takeIf { it.isNotBlank() } ?: "1"
        val uom = etUom.text.toString().trim().uppercase().takeIf { it.isNotBlank() } ?: "EA"
        val plant = etPlant.text.toString().trim().takeIf { it.isNotBlank() } ?: "1110"
        val price = etPrice.text.toString().trim()

        if (material.isBlank() && shortText.isBlank()) {
            Toast.makeText(requireContext(), "Please provide Material ID or Short Text.", Toast.LENGTH_SHORT).show()
            return
        }

        // Apply data cleaning precisely as done in React `Dashboard.jsx` lines 201-450
        var item = PurchaseRequisitionItem(
            PurchaseRequisitionItem = "00010",
            Material = if (material.isNotBlank()) material.padStart(18, '0') else null,
            PurchaseRequisitionItemText = if (material.isBlank()) shortText else null,
            MaterialGroup = if (material.isBlank()) "A001" else null,
            RequestedQuantity = quantity,
            BaseUnit = uom,     
            BaseUnitISOCode = uom, 
            Plant = plant,
            CompanyCode = "1110",
            AccountAssignmentCategory = "U",
            PurchasingGroup = "001"
        )

        // Only send pricing if it's > 0
        if (price.isNotBlank() && price.toFloatOrNull() ?: 0f > 0f) {
            item = item.copy(
                PurchaseRequisitionPrice = price,
                PurReqnItemCurrency = "EUR"
            )
        }

        if (existingPrNumber != null) {
            // Let SAP assign item number, clear the field
            item = item.copy(PurchaseRequisitionItem = "")
            viewModel.addItemToPR(existingPrNumber!!, item)
        } else {
            val description = etPrDescription.text.toString().trim()
            val payload = PurchaseRequisition(
                PurchaseRequisition = "", 
                PurchaseRequisitionType = "NB",
                PurReqnDescription = description,
                _PurchaseRequisitionItem = listOf(item)
            )
            viewModel.createPR(payload)
        }
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
                    Toast.makeText(requireContext(), "Success!", Toast.LENGTH_SHORT).show()
                    viewModel.resetResult()
                    findNavController().navigateUp()
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
