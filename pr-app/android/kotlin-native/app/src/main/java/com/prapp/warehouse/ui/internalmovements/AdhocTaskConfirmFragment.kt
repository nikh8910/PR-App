package com.prapp.warehouse.ui.internalmovements

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.ui.inboundtasks.InboundTaskAdapter
import com.prapp.warehouse.utils.NetworkResult

class AdhocTaskConfirmFragment : Fragment() {

    private lateinit var viewModel: AdhocTaskConfirmViewModel
    private lateinit var adapter: InboundTaskAdapter

    private lateinit var layoutSearch: LinearLayout
    private lateinit var layoutListHeader: TextView
    private lateinit var recyclerTasks: RecyclerView
    private lateinit var layoutDetail: View
    private lateinit var layoutConfirmBtn: View

    private lateinit var spinnerWarehouse: Spinner
    private lateinit var inputSearchValue: EditText
    private lateinit var btnSearch: Button
    private lateinit var btnConfirm: Button
    private lateinit var progressBar: ProgressBar
    
    private lateinit var textError: TextView
    private lateinit var textSuccess: TextView
    private lateinit var textHeaderTitle: TextView

    // Detail Fields
    private lateinit var textTaskId: TextView
    private lateinit var textProduct: TextView
    private lateinit var textQuantity: TextView
    private lateinit var textHu: TextView
    private lateinit var textSrcBin: TextView
    private lateinit var textDstBin: TextView
    private lateinit var textProcessType: TextView

    private var selectedWarehouse = "UKW2"
    private var currentTask: WarehouseTask? = null
    private var currentStep = "search" // "search", "list", "detail"

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_adhoc_task_confirm, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = ViewModelProvider(this)[AdhocTaskConfirmViewModel::class.java]

        initViews(view)
        setupObservers()
        setupListeners()
        updateUiState("search")
    }

    private fun initViews(view: View) {
        layoutSearch = view.findViewById(R.id.layout_search)
        layoutListHeader = view.findViewById(R.id.text_list_header)
        recyclerTasks = view.findViewById(R.id.recycler_tasks)
        layoutDetail = view.findViewById(R.id.layout_detail)
        layoutConfirmBtn = view.findViewById(R.id.layout_confirm_btn)

        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        inputSearchValue = view.findViewById(R.id.input_search_value)
        btnSearch = view.findViewById(R.id.btn_search)
        btnConfirm = view.findViewById(R.id.btn_confirm)
        progressBar = view.findViewById(R.id.progress_bar)
        
        textError = view.findViewById(R.id.text_error)
        textSuccess = view.findViewById(R.id.text_success)
        textHeaderTitle = view.findViewById(R.id.text_header_title)

        // Detail Fields
        textTaskId = view.findViewById(R.id.text_task_id)
        textProduct = view.findViewById(R.id.text_product)
        textQuantity = view.findViewById(R.id.text_quantity)
        textHu = view.findViewById(R.id.text_hu)
        textSrcBin = view.findViewById(R.id.text_src_bin)
        textDstBin = view.findViewById(R.id.text_dst_bin)
        textProcessType = view.findViewById(R.id.text_process_type)

        // Setup Warehouse Spinner (Mocking fetching warehouses for speed)
        val adapterWH = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, listOf("UKW2", "USW2"))
        adapterWH.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = adapterWH

        // Setup RecyclerView
        adapter = InboundTaskAdapter { task ->
            openDetail(task)
        }
        recyclerTasks.layoutManager = LinearLayoutManager(context)
        recyclerTasks.adapter = adapter
    }

    private fun setupListeners() {
        view?.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener {
            handleBackNavigation()
        }

        view?.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        btnSearch.setOnClickListener {
            clearMessages()
            selectedWarehouse = spinnerWarehouse.selectedItem.toString()
            val searchValue = inputSearchValue.text.toString()
            viewModel.fetchAdhocTasks(selectedWarehouse, searchValue)
        }

        btnConfirm.setOnClickListener {
            clearMessages()
            currentTask?.let { task ->
                viewModel.confirmAdhocTask(
                    warehouse = task.ewmWarehouse ?: selectedWarehouse,
                    taskId = task.warehouseTask ?: "",
                    taskItem = task.warehouseTaskItem ?: ""
                )
            }
        }
    }

    private fun setupObservers() {
        viewModel.taskList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnSearch.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    val tasks = result.data ?: emptyList()
                    
                    if (tasks.isEmpty()) {
                        showError("No open adhoc tasks found.")
                        updateUiState("search")
                    } else if (tasks.size == 1) {
                        openDetail(tasks[0])
                    } else {
                        adapter.submitList(tasks)
                        updateUiState("list")
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnSearch.isEnabled = true
                    showError(result.message ?: "Search failed")
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
                    btnConfirm.isEnabled = true
                    showSuccess(result.data ?: "Task confirmed.")
                    
                    // Delay and return to search
                    view?.postDelayed({
                        updateUiState("search")
                        currentTask = null
                        inputSearchValue.text?.clear()
                        clearMessages()
                    }, 2000)
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnConfirm.isEnabled = true
                    showError(result.message ?: "Confirmation failed")
                }
            }
        }
    }

    private fun openDetail(task: WarehouseTask) {
        currentTask = task
        
        textTaskId.text = "Task: ${task.warehouseTask?.trimStart('0')}"
        textProduct.text = task.product?.trimStart('0') ?: "N/A"
        textQuantity.text = "${task.targetQuantityInBaseUnit} ${task.baseUnit}"
        val hu = task.sourceHandlingUnit ?: task.destinationHandlingUnit
        textHu.text = hu?.takeIf { it.isNotBlank() && !it.matches(Regex("^0+$")) } ?: "N/A"
        textSrcBin.text = task.sourceStorageBin ?: "N/A"
        textDstBin.text = task.destinationStorageBin ?: "N/A"
        textProcessType.text = "${task.warehouseProcessType ?: "N/A"} - ${task.warehouseActivityType ?: ""}"
        
        updateUiState("detail")
    }

    private fun updateUiState(step: String) {
        currentStep = step
        when (step) {
            "search" -> {
                textHeaderTitle.text = "Confirm Adhoc Task"
                layoutSearch.visibility = View.VISIBLE
                layoutListHeader.visibility = View.GONE
                recyclerTasks.visibility = View.GONE
                layoutDetail.visibility = View.GONE
                layoutConfirmBtn.visibility = View.GONE
            }
            "list" -> {
                textHeaderTitle.text = "Select Task"
                layoutSearch.visibility = View.VISIBLE
                layoutListHeader.visibility = View.VISIBLE
                recyclerTasks.visibility = View.VISIBLE
                layoutDetail.visibility = View.GONE
                layoutConfirmBtn.visibility = View.GONE
            }
            "detail" -> {
                textHeaderTitle.text = "Task Details"
                layoutSearch.visibility = View.GONE
                layoutListHeader.visibility = View.GONE
                recyclerTasks.visibility = View.GONE
                layoutDetail.visibility = View.VISIBLE
                layoutConfirmBtn.visibility = View.VISIBLE
            }
        }
    }

    private fun handleBackNavigation() {
        when (currentStep) {
            "detail" -> {
                // Using itemCount since it's a RecyclerView.Adapter
                if (adapter.itemCount > 0) { // If there are still tasks in the list, go back to list view
                    updateUiState("list")
                } else { // Otherwise, go back to search
                    updateUiState("search")
                }
            }
            "list" -> updateUiState("search")
            else -> findNavController().navigateUp()
        }
    }

    private fun showError(msg: String) {
        textError.text = msg
        textError.visibility = View.VISIBLE
        textSuccess.visibility = View.GONE
        view?.postDelayed({ textError.visibility = View.GONE }, 5000)
    }

    private fun showSuccess(msg: String) {
        textSuccess.text = msg
        textSuccess.visibility = View.VISIBLE
        textError.visibility = View.GONE
        view?.postDelayed({ textSuccess.visibility = View.GONE }, 3000)
    }
    
    private fun clearMessages() {
        textError.visibility = View.GONE
        textSuccess.visibility = View.GONE
    }
}
