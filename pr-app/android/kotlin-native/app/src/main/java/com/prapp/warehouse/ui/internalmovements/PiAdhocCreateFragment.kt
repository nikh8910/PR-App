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
import com.google.android.material.snackbar.Snackbar
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem
import com.prapp.warehouse.utils.NetworkResult

class PiAdhocCreateFragment : Fragment() {

    private lateinit var viewModel: PiAdhocCreateViewModel
    private lateinit var adapter: PiAdhocItemAdapter

    // UI Elements
    private lateinit var layoutAddedItems: LinearLayout
    private lateinit var textItemsHeader: TextView
    private lateinit var recyclerPiItems: RecyclerView
    private lateinit var btnCreatePi: Button
    private lateinit var progressBar: ProgressBar

    // Form Elements
    private lateinit var spinnerWarehouse: Spinner
    private lateinit var spinnerPiProcedure: Spinner
    private lateinit var inputStorageType: EditText
    private lateinit var inputStorageBin: EditText
    private lateinit var inputProduct: EditText
    private lateinit var inputBatch: EditText
    private lateinit var spinnerReason: Spinner
    private lateinit var btnAddItem: Button

    private val itemsList = mutableListOf<EwmPhysicalInventoryItem>()
    
    // Hardcoded options for UI parity before implementing full value helps
    private val warehouses = listOf("UKW2", "USW2")
    private val piProcedures = listOf(
        "HL — Ad Hoc PI (Bin-Specific)",
        "HS — Ad Hoc PI (Product-Specific)",
        "NL — Low Stock / Zero Stock PI",
        "PL — Putaway Physical Inventory",
        "ML — Storage Bin Check"
    )

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_pi_adhoc_create, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = ViewModelProvider(this)[PiAdhocCreateViewModel::class.java]

        initViews(view)
        setupObservers()
        setupListeners()
        updateListUi()
    }

    private fun initViews(view: View) {
        layoutAddedItems = view.findViewById(R.id.layout_added_items)
        textItemsHeader = view.findViewById(R.id.text_items_header)
        recyclerPiItems = view.findViewById(R.id.recycler_pi_items)
        btnCreatePi = view.findViewById(R.id.btn_create_pi)
        progressBar = view.findViewById(R.id.progress_bar)

        spinnerWarehouse = view.findViewById(R.id.spinner_warehouse)
        spinnerPiProcedure = view.findViewById(R.id.spinner_pi_procedure)
        inputStorageType = view.findViewById(R.id.input_storage_type)
        inputStorageBin = view.findViewById(R.id.input_storage_bin)
        inputProduct = view.findViewById(R.id.input_product)
        inputBatch = view.findViewById(R.id.input_batch)
        spinnerReason = view.findViewById(R.id.spinner_reason)
        btnAddItem = view.findViewById(R.id.btn_add_item)

        // Setup Spinners
        val whAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, warehouses)
        whAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerWarehouse.adapter = whAdapter

        val piProcAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, piProcedures)
        piProcAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerPiProcedure.adapter = piProcAdapter

        val reasonAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, listOf("Select Reason (optional)", "DAMA", "SCRA", "THFT"))
        reasonAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerReason.adapter = reasonAdapter

        // Setup RecyclerView
        adapter = PiAdhocItemAdapter(itemsList) { position ->
            itemsList.removeAt(position)
            adapter.updateData(itemsList)
            updateListUi()
        }
        recyclerPiItems.layoutManager = LinearLayoutManager(context)
        recyclerPiItems.adapter = adapter
    }

    private fun setupListeners() {
        view?.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener {
            findNavController().navigateUp()
        }

        view?.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        btnAddItem.setOnClickListener {
            val warehouse = spinnerWarehouse.selectedItem.toString()
            val procedureStr = spinnerPiProcedure.selectedItem.toString()
            val procedureCode = procedureStr.substringBefore(" ").trim()
            val storageBin = inputStorageBin.text.toString().trim()
            
            if (storageBin.isEmpty()) {
                inputStorageBin.error = "Storage Bin is required"
                return@setOnClickListener
            }

            val storageType = inputStorageType.text.toString().trim().takeIf { it.isNotEmpty() }
            val product = inputProduct.text.toString().trim().takeIf { it.isNotEmpty() }
            val batch = inputBatch.text.toString().trim().takeIf { it.isNotEmpty() }
            
            val reasonStr = spinnerReason.selectedItem.toString()
            val reason = if (reasonStr.startsWith("Select")) null else reasonStr

            val item = EwmPhysicalInventoryItem(
                EWMWarehouse = warehouse,
                PhysicalInventoryDocumentType = procedureCode,
                EWMStorageBin = storageBin,
                EWMStorageType = storageType,
                Product = product,
                Batch = batch,
                EWMPhysInvtryReason = reason
            )

            itemsList.add(item)
            adapter.updateData(itemsList)
            updateListUi()

            // Clear inputs for next item
            inputStorageBin.text?.clear()
            inputProduct.text?.clear()
            inputBatch.text?.clear()
            spinnerReason.setSelection(0)
            
            view?.let {
                Snackbar.make(it, "Item added to queue", Snackbar.LENGTH_SHORT).show()
            }
        }

        btnCreatePi.setOnClickListener {
            if (itemsList.isEmpty()) {
                Toast.makeText(context, "Add at least one item", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.createPiDocument(itemsList)
        }
    }

    private fun setupObservers() {
        viewModel.createResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    btnCreatePi.isEnabled = false
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    btnCreatePi.isEnabled = true
                    
                    Toast.makeText(context, result.data, Toast.LENGTH_LONG).show()
                    
                    // Clear list on success
                    itemsList.clear()
                    adapter.updateData(itemsList)
                    updateListUi()
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    btnCreatePi.isEnabled = true
                    view?.let {
                        Snackbar.make(it, result.message ?: "Failed to create PI Document", Snackbar.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private fun updateListUi() {
        if (itemsList.isEmpty()) {
            layoutAddedItems.visibility = View.GONE
        } else {
            layoutAddedItems.visibility = View.VISIBLE
            textItemsHeader.text = "ITEMS TO CREATE (${itemsList.size})"
            btnCreatePi.text = "CREATE PI DOCUMENT (${itemsList.size} ITEM${if(itemsList.size > 1) "S" else ""})"
        }
    }
}
