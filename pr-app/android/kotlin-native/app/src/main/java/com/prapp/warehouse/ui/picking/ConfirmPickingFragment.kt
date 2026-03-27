package com.prapp.warehouse.ui.picking

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.prapp.warehouse.R
import com.prapp.warehouse.utils.NetworkResult

class ConfirmPickingFragment : Fragment() {

    private val viewModel: PickingViewModel by viewModels()

    private lateinit var textSubtitle: TextView
    private lateinit var textProductSummary: TextView
    private lateinit var textQtySummary: TextView
    private lateinit var textDestBin: TextView
    private lateinit var inputSrcBin: TextInputEditText
    private lateinit var inputSrcType: TextInputEditText
    private lateinit var inputActualQty: TextInputEditText
    private lateinit var layoutExceptionCode: TextInputLayout
    private lateinit var inputExceptionCode: TextInputEditText
    private lateinit var inputSrcHu: TextInputEditText
    private lateinit var btnConfirm: Button
    private lateinit var progressBar: ProgressBar

    private var plannedBin = ""
    private var plannedQty = 0.0
    private var baseUnit = ""

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_confirm_picking, container, false)

        textSubtitle = view.findViewById(R.id.text_subtitle)
        textProductSummary = view.findViewById(R.id.text_product_summary)
        textQtySummary = view.findViewById(R.id.text_qty_summary)
        textDestBin = view.findViewById(R.id.text_dest_bin)
        
        inputSrcBin = view.findViewById(R.id.input_src_bin)
        inputSrcType = view.findViewById(R.id.input_src_type)
        inputActualQty = view.findViewById(R.id.input_actual_qty)
        layoutExceptionCode = view.findViewById(R.id.layout_exception_code)
        inputExceptionCode = view.findViewById(R.id.input_exception_code)
        inputSrcHu = view.findViewById(R.id.input_src_hu)
        btnConfirm = view.findViewById(R.id.btn_confirm)
        progressBar = view.findViewById(R.id.progress_bar)

        val warehouse = arguments?.getString("warehouse") ?: ""
        val taskId = arguments?.getString("taskId") ?: ""
        val taskItem = arguments?.getString("taskItem") ?: ""

        textSubtitle.text = "WT: ${taskId} • Item ${taskItem}"
        
        view.findViewById<android.widget.ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }
        view.findViewById<android.widget.ImageView>(R.id.btn_home).setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        setupObservers()
        setupListeners(warehouse, taskId, taskItem)

        viewModel.fetchTaskDetail(warehouse, taskId, taskItem)

        return view
    }

    private fun setupObservers() {
        viewModel.taskDetail.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> progressBar.visibility = View.VISIBLE
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val task = result.data
                    if (task != null) {
                        textProductSummary.text = "Product: ${task.product ?: "N/A"}"
                        plannedQty = task.targetQuantityInBaseUnit?.toDoubleOrNull() ?: 0.0
                        baseUnit = task.baseUnit ?: "EA"
                        plannedBin = task.sourceStorageBin ?: ""
                        
                        textQtySummary.text = "Planned Qty: $plannedQty $baseUnit"
                        textDestBin.text = "Drop-off: ${task.destinationStorageBin ?: "N/A"}"
                        
                        inputSrcBin.setText(plannedBin)
                        inputSrcType.setText(task.sourceStorageType ?: "")
                        inputActualQty.setText(plannedQty.toString())
                        inputSrcHu.setText(task.sourceHandlingUnit ?: task.destinationHandlingUnit ?: "")
                        
                        checkExceptionRequired()
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }

        viewModel.confirmResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnConfirm.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), "Task Confirmed Successfully", Toast.LENGTH_LONG).show()
                    findNavController().navigateUp()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnConfirm.isEnabled = true
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun setupListeners(warehouse: String, taskId: String, taskItem: String) {
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                checkExceptionRequired()
            }
        }
        
        inputSrcBin.addTextChangedListener(watcher)
        inputActualQty.addTextChangedListener(watcher)

        btnConfirm.setOnClickListener {
            val srcBin = inputSrcBin.text.toString().trim()
            val actualQtyText = inputActualQty.text.toString().trim()
            val actualQtyNum = actualQtyText.toDoubleOrNull() ?: 0.0
            val exceptionCode = inputExceptionCode.text.toString().trim()
            
            if (srcBin.isEmpty() || actualQtyText.isEmpty()) {
                Toast.makeText(requireContext(), "Source Bin and Qty are required", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (layoutExceptionCode.visibility == View.VISIBLE && exceptionCode.isEmpty()) {
                Toast.makeText(requireContext(), "Exception code is required for variance", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val isExact = srcBin.equals(plannedBin, ignoreCase = true) && actualQtyNum == plannedQty

            viewModel.confirmTask(
                warehouse = warehouse,
                taskId = taskId,
                taskItem = taskItem,
                actualQty = actualQtyNum,
                exceptionCode = exceptionCode,
                isExact = isExact
            )
        }
    }

    private fun checkExceptionRequired() {
        val currentBin = inputSrcBin.text.toString().trim()
        val currentQty = inputActualQty.text.toString().toDoubleOrNull() ?: 0.0
        
        val binChanged = currentBin.isNotEmpty() && !currentBin.equals(plannedBin, ignoreCase = true)
        val qtyChanged = currentQty != plannedQty
        
        val exceptionHelper = view?.findViewById<TextView>(R.id.text_exception_code_helper)

        if (binChanged || qtyChanged) {
            layoutExceptionCode.visibility = View.VISIBLE
            exceptionHelper?.visibility = View.VISIBLE
        } else {
            layoutExceptionCode.visibility = View.GONE
            exceptionHelper?.visibility = View.GONE
        }
    }
}
