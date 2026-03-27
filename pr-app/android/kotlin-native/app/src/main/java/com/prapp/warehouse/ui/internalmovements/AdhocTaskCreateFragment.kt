package com.prapp.warehouse.ui.internalmovements

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.textfield.TextInputEditText
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.WarehouseStorageType
import com.prapp.warehouse.utils.SharedPrefsManager

class AdhocTaskCreateFragment : Fragment() {

    private val viewModel: InternalMovementsViewModel by viewModels()

    private lateinit var spinnerWarehouse: Spinner
    private lateinit var rgTaskType: RadioGroup
    private lateinit var inputProcessType: TextInputEditText
    
    // Product fields
    private lateinit var layoutProductFields: LinearLayout
    private lateinit var inputProduct: TextInputEditText
    private lateinit var inputQty: TextInputEditText
    private lateinit var inputUom: TextInputEditText
    private lateinit var inputStockType: TextInputEditText
    
    // HU fields
    private lateinit var layoutHuFields: LinearLayout
    private lateinit var inputHuPrimary: TextInputEditText
    
    // Source/Dest
    private lateinit var cardSource: View
    private lateinit var spinnerSrcType: Spinner
    private lateinit var inputSrcBin: TextInputEditText
    private lateinit var inputSrcHuOpt: TextInputEditText
    
    private lateinit var spinnerDstType: Spinner
    private lateinit var inputDstBin: TextInputEditText

    private lateinit var btnCreate: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textSuccess: TextView

    private var storageTypesList: List<WarehouseStorageType> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_adhoc_task_create, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initViews(view)
        setupListeners()
        observeViewModel()
        
        // Setup initial data
        setupWarehouseSpinner()
    }

    private fun initViews(view: View) {
        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        rgTaskType = view.findViewById(R.id.rg_task_type)
        inputProcessType = view.findViewById(R.id.input_process_type)
        
        layoutProductFields = view.findViewById(R.id.layout_product_fields)
        inputProduct = view.findViewById(R.id.input_product)
        inputQty = view.findViewById(R.id.input_qty)
        inputUom = view.findViewById(R.id.input_uom)
        inputStockType = view.findViewById(R.id.input_stock_type)
        
        layoutHuFields = view.findViewById(R.id.layout_hu_fields)
        inputHuPrimary = view.findViewById(R.id.input_hu_primary)
        
        cardSource = view.findViewById(R.id.card_source)
        spinnerSrcType = view.findViewById(R.id.spinner_src_type)
        inputSrcBin = view.findViewById(R.id.input_src_bin)
        inputSrcHuOpt = view.findViewById(R.id.input_src_hu_opt)
        
        spinnerDstType = view.findViewById(R.id.spinner_dst_type)
        inputDstBin = view.findViewById(R.id.input_dst_bin)
        
        btnCreate = view.findViewById(R.id.btn_create)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textSuccess = view.findViewById(R.id.text_success)

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener { findNavController().navigateUp() }
        view.findViewById<ImageView>(R.id.btn_home).setOnClickListener { findNavController().navigate(R.id.dashboardFragment) }
    }

    private fun setupListeners() {
        rgTaskType.setOnCheckedChangeListener { _, checkedId ->
            if (checkedId == R.id.rb_product) {
                layoutProductFields.visibility = View.VISIBLE
                layoutHuFields.visibility = View.GONE
                cardSource.visibility = View.VISIBLE
            } else {
                layoutProductFields.visibility = View.GONE
                layoutHuFields.visibility = View.VISIBLE
                cardSource.visibility = View.GONE
            }
        }

        spinnerWarehouse.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val warehouse = parent?.getItemAtPosition(position).toString()
                if (warehouse.isNotBlank()) {
                    viewModel.fetchStorageTypes(warehouse)
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        btnCreate.setOnClickListener {
            handleCreateTask()
        }
    }

    private fun observeViewModel() {
        viewModel.isLoading.observe(viewLifecycleOwner) { isLoading ->
            progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
            btnCreate.isEnabled = !isLoading
        }

        viewModel.error.observe(viewLifecycleOwner) { error ->
            if (!error.isNullOrBlank()) {
                textError.text = error
                textError.visibility = View.VISIBLE
                textSuccess.visibility = View.GONE
            } else {
                textError.visibility = View.GONE
            }
        }

        viewModel.successMessage.observe(viewLifecycleOwner) { success ->
            if (!success.isNullOrBlank()) {
                textSuccess.text = success
                textSuccess.visibility = View.VISIBLE
                textError.visibility = View.GONE
                clearForm()
            } else {
                textSuccess.visibility = View.GONE
            }
        }

        viewModel.storageTypes.observe(viewLifecycleOwner) { types ->
            storageTypesList = types
            val typeNames = mutableListOf("Select Type")
            typeNames.addAll(types.map { it.EWMStorageType })
            
            val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, typeNames)
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            
            spinnerSrcType.adapter = adapter
            spinnerDstType.adapter = adapter
        }
    }

    private fun setupWarehouseSpinner() {
        val prefs = SharedPrefsManager(requireContext())
        val whse = prefs.getUsername()?.takeIf { it.isNotBlank() } ?: "UKW1" // Default fallback
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, listOf(whse))
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = adapter
    }

    private fun handleCreateTask() {
        val warehouse = spinnerWarehouse.selectedItem?.toString() ?: ""
        val processType = inputProcessType.text.toString().trim()
        val isProductTask = rgTaskType.checkedRadioButtonId == R.id.rb_product

        val srcType = if (spinnerSrcType.selectedItemPosition > 0) spinnerSrcType.selectedItem.toString() else null
        val dstType = if (spinnerDstType.selectedItemPosition > 0) spinnerDstType.selectedItem.toString() else null

        if (warehouse.isBlank()) {
            showError("Select a warehouse")
            return
        }

        if (isProductTask) {
            val product = inputProduct.text.toString()
            val qtyStr = inputQty.text.toString()
            if (product.isBlank() || qtyStr.isBlank() || srcType.isNullOrBlank() || inputSrcBin.text.isNullOrBlank() || dstType.isNullOrBlank() || inputDstBin.text.isNullOrBlank()) {
                showError("Please fill all required fields")
                return
            }
            
            viewModel.createAdhocTask(
                warehouse = warehouse,
                taskType = "Product",
                processType = processType,
                product = product,
                quantity = qtyStr.toDoubleOrNull(),
                unit = inputUom.text.toString().trim(),
                stockType = inputStockType.text.toString().trim(),
                srcStorageType = srcType,
                srcBin = inputSrcBin.text.toString(),
                dstStorageType = dstType,
                dstBin = inputDstBin.text.toString(),
                srcHU = inputSrcHuOpt.text.toString(),
                dstHU = null,
                huValue = null
            )
        } else {
            val hu = inputHuPrimary.text.toString()
            if (hu.isBlank() || dstType.isNullOrBlank() || inputDstBin.text.isNullOrBlank()) {
                showError("Please fill all required fields")
                return
            }

            viewModel.createAdhocTask(
                warehouse = warehouse,
                taskType = "HU",
                processType = processType,
                product = null,
                quantity = null,
                unit = null,
                stockType = null,
                srcStorageType = null,
                srcBin = null,
                dstStorageType = dstType,
                dstBin = inputDstBin.text.toString(),
                srcHU = null,
                dstHU = null,
                huValue = hu
            )
        }
    }

    private fun showError(msg: String) {
        textError.text = msg
        textError.visibility = View.VISIBLE
        textSuccess.visibility = View.GONE
    }

    private fun clearForm() {
        inputProduct.setText("")
        inputQty.setText("")
        inputHuPrimary.setText("")
        inputSrcBin.setText("")
        inputDstBin.setText("")
        inputSrcHuOpt.setText("")
        spinnerSrcType.setSelection(0)
        spinnerDstType.setSelection(0)
    }
}
