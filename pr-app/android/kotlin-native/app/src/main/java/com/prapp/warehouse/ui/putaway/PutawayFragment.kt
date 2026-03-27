package com.prapp.warehouse.ui.putaway

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

class PutawayFragment : Fragment() {

    private val viewModel: PutawayViewModel by viewModels()

    private lateinit var textSubtitle: TextView
    private lateinit var textProductSummary: TextView
    private lateinit var textQtySummary: TextView
    private lateinit var textSourceBin: TextView
    private lateinit var inputDestBin: TextInputEditText
    private lateinit var inputDestType: TextInputEditText
    private lateinit var inputActualQty: TextInputEditText
    private lateinit var layoutExceptionCode: TextInputLayout
    private lateinit var inputExceptionCode: TextInputEditText
    private lateinit var inputDestHu: TextInputEditText
    private lateinit var btnConfirm: Button
    private lateinit var progressBar: ProgressBar

    private var plannedBin = ""
    private var plannedQty = 0.0
    private var baseUnit = ""

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_putaway, container, false)

        textSubtitle = view.findViewById(R.id.text_subtitle)
        textProductSummary = view.findViewById(R.id.text_product_summary)
        textQtySummary = view.findViewById(R.id.text_qty_summary)
        textSourceBin = view.findViewById(R.id.text_source_bin)
        
        inputDestBin = view.findViewById(R.id.input_dest_bin)
        inputDestType = view.findViewById(R.id.input_dest_type)
        inputActualQty = view.findViewById(R.id.input_actual_qty)
        layoutExceptionCode = view.findViewById(R.id.layout_exception_code)
        inputExceptionCode = view.findViewById(R.id.input_exception_code)
        inputDestHu = view.findViewById(R.id.input_dest_hu)
        btnConfirm = view.findViewById(R.id.btn_confirm)
        progressBar = view.findViewById(R.id.progress_bar)

        val warehouse = arguments?.getString("warehouse") ?: ""
        val taskId = arguments?.getString("taskId") ?: ""
        val taskItem = arguments?.getString("taskItem") ?: ""

        textSubtitle.text = "WT: ${taskId} • Item ${taskItem}"

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
                        plannedBin = task.destinationStorageBin ?: ""
                        
                        textQtySummary.text = "Planned Qty: $plannedQty $baseUnit"
                        textSourceBin.text = "Source Bin: ${task.sourceStorageBin ?: "N/A"}"
                        
                        inputDestBin.setText(plannedBin)
                        inputDestType.setText(task.destinationStorageType ?: "")
                        inputActualQty.setText(plannedQty.toString())
                        inputDestHu.setText(task.destinationHandlingUnit ?: task.sourceHandlingUnit ?: "")
                        
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
        
        inputDestBin.addTextChangedListener(watcher)
        inputActualQty.addTextChangedListener(watcher)

        btnConfirm.setOnClickListener {
            val destBin = inputDestBin.text.toString().trim()
            val destType = inputDestType.text.toString().trim()
            val actualQtyText = inputActualQty.text.toString().trim()
            val actualQtyNum = actualQtyText.toDoubleOrNull() ?: 0.0
            val destHu = inputDestHu.text.toString().trim()
            val exceptionCode = inputExceptionCode.text.toString().trim()
            
            if (destBin.isEmpty() || actualQtyText.isEmpty()) {
                Toast.makeText(requireContext(), "Destination Bin and Qty are required", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (layoutExceptionCode.visibility == View.VISIBLE && exceptionCode.isEmpty()) {
                Toast.makeText(requireContext(), "Exception code is required for variance", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            viewModel.confirmPutaway(
                warehouse,
                taskId,
                taskItem,
                actualQtyNum,
                destBin,
                destType,
                exceptionCode,
                destHu,
                plannedQty,
                plannedBin,
                baseUnit
            )
        }
    }

    private fun checkExceptionRequired() {
        val currentBin = inputDestBin.text.toString().trim()
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
