package com.prapp.warehouse.ui.physicalinventory

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

class PhysicalInventoryFragment : Fragment() {

    private lateinit var viewModel: PhysicalInventoryViewModel
    private lateinit var adapter: PIListAdapter
    private lateinit var layoutFilter: ScrollView
    private lateinit var layoutList: LinearLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var textError: TextView
    private lateinit var textResultCount: TextView
    private lateinit var editPiDocNumber: EditText
    private lateinit var editPlant: EditText
    private lateinit var editStorageLocation: EditText

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_physical_inventory, container, false)

        viewModel = ViewModelProvider(requireActivity())[PhysicalInventoryViewModel::class.java]

        layoutFilter = view.findViewById(R.id.layout_filter)
        layoutList = view.findViewById(R.id.layout_list)
        progressBar = view.findViewById(R.id.progress_bar)
        textError = view.findViewById(R.id.text_error)
        textResultCount = view.findViewById(R.id.text_result_count)
        editPiDocNumber = view.findViewById(R.id.edit_pi_doc_number)
        editPlant = view.findViewById(R.id.edit_plant)
        editStorageLocation = view.findViewById(R.id.edit_storage_location)

        val recyclerView = view.findViewById<RecyclerView>(R.id.recycler_pi_list)
        adapter = PIListAdapter { doc ->
            viewModel.selectDoc(doc)
            viewModel.fetchPIItems(doc.piDocument, doc.fiscalYear)
            findNavController().navigate(R.id.action_physicalInventory_to_detail)
        }
        recyclerView.layoutManager = LinearLayoutManager(context)
        recyclerView.adapter = adapter

        view.findViewById<Button>(R.id.btn_search).setOnClickListener {
            val f = PhysicalInventoryViewModel.PIFilters(
                piDocNumber = editPiDocNumber.text.toString().trim(),
                plant = editPlant.text.toString().trim(),
                storageLocation = editStorageLocation.text.toString().trim()
            )
            if (f.piDocNumber.isEmpty() && f.plant.isEmpty() && f.storageLocation.isEmpty()) {
                Toast.makeText(context, "Enter at least one filter (PI Doc#, Plant, or Storage Location)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.setFilters(f)
            viewModel.fetchPhysicalInventoryDocs()
            showListView()
        }

        view.findViewById<TextView>(R.id.btn_change_filters).setOnClickListener {
            showFilterView()
        }

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        viewModel.piList.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    textError.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val list = result.data ?: emptyList()
                    textResultCount.text = "${list.size} PI Doc${if (list.size != 1) "s" else ""} found"
                    if (list.isEmpty()) {
                        textError.visibility = View.VISIBLE
                        textError.text = "No PI Documents found."
                        adapter.submitList(emptyList())
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
