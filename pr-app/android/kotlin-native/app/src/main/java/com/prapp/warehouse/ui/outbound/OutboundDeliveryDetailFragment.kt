package com.prapp.warehouse.ui.outbound

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.Gson
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.OutboundDeliveryHeader
import com.prapp.warehouse.utils.NetworkResult

class OutboundDeliveryDetailFragment : Fragment() {

    private val viewModel: OutboundDeliveryViewModel by activityViewModels()
    private lateinit var adapter: OutboundDeliveryDetailAdapter

    private lateinit var textDeliveryId: TextView
    private lateinit var textGiStatus: TextView
    private lateinit var textPartnerName: TextView
    private lateinit var textDeliveryDate: TextView
    private lateinit var btnPostGi: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var emptyState: TextView
    private lateinit var recyclerItems: RecyclerView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_obd_detail, container, false)
        initViews(view)
        setupRecyclerView()
        setupListeners(view)
        
        // Load initial data from arguments if available
        arguments?.getString("obdData")?.let { json ->
            try {
                val obd = Gson().fromJson(json, OutboundDeliveryHeader::class.java)
                viewModel.selectObd(obd)
                obd.EWMOutboundDeliveryOrder?.let { 
                    viewModel.fetchOutboundDeliveryDetails(it) 
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } ?: run {
            // Fallback to viewModel state
            viewModel.currentObd.value?.EWMOutboundDeliveryOrder?.let {
                viewModel.fetchOutboundDeliveryDetails(it)
            }
        }

        observeViewModel()
        return view
    }

    private fun initViews(view: View) {
        textDeliveryId = view.findViewById(R.id.text_delivery_id)
        textGiStatus = view.findViewById(R.id.text_gi_status)
        textPartnerName = view.findViewById(R.id.text_partner_name)
        textDeliveryDate = view.findViewById(R.id.text_delivery_date)
        btnPostGi = view.findViewById(R.id.btn_post_gi)
        progressBar = view.findViewById(R.id.progress_bar)
        emptyState = view.findViewById(R.id.empty_state)
        recyclerItems = view.findViewById(R.id.recycler_items)
    }

    private fun setupRecyclerView() {
        adapter = OutboundDeliveryDetailAdapter { item ->
            // In the future, tapping an item could open inline editing or warehouse tasks
            Toast.makeText(requireContext(), "Item: ${item.Product}", Toast.LENGTH_SHORT).show()
        }
        recyclerItems.layoutManager = LinearLayoutManager(requireContext())
        recyclerItems.adapter = adapter
    }

    private fun setupListeners(view: View) {
        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }

        view.findViewById<ImageView>(R.id.btn_refresh).setOnClickListener {
            viewModel.currentObd.value?.EWMOutboundDeliveryOrder?.let {
                viewModel.fetchOutboundDeliveryDetails(it)
            }
        }

        btnPostGi.setOnClickListener {
            viewModel.currentObd.value?.EWMOutboundDeliveryOrder?.let {
                viewModel.postGoodsIssue(it)
            }
        }
    }

    private fun observeViewModel() {
        viewModel.currentObd.observe(viewLifecycleOwner) { obd ->
            obd?.let {
                textDeliveryId.text = it.EWMOutboundDeliveryOrder?.trimStart('0') ?: "Unknown"
                textPartnerName.text = it.ShipToPartyName ?: it.ShipToParty ?: "N/A"
                textDeliveryDate.text = it.DeliveryDate ?: it.PlannedDeliveryUTCDateTime ?: "N/A"
                
                // Map Goods Issue Status
                val statusStr = it.GoodsIssueStatus ?: "Not Started"
                textGiStatus.text = statusStr
                
                when (statusStr) {
                    "C" -> {
                        textGiStatus.text = "Completed"
                        textGiStatus.setBackgroundResource(R.drawable.bg_status_green)
                        textGiStatus.setTextColor(android.graphics.Color.parseColor("#15803D"))
                        btnPostGi.isEnabled = false
                        btnPostGi.alpha = 0.5f
                    }
                    "9" -> {
                        textGiStatus.text = "In Process"
                        textGiStatus.setBackgroundResource(R.drawable.bg_status_yellow)
                        textGiStatus.setTextColor(android.graphics.Color.parseColor("#D97706"))
                        btnPostGi.isEnabled = true
                        btnPostGi.alpha = 1.0f
                    }
                    else -> {
                        textGiStatus.text = "Not Started"
                        textGiStatus.setBackgroundResource(R.drawable.bg_status_gray)
                        textGiStatus.setTextColor(android.graphics.Color.parseColor("#475569"))
                        btnPostGi.isEnabled = true
                        btnPostGi.alpha = 1.0f
                    }
                }
            }
        }

        viewModel.obdItems.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    progressBar.visibility = View.VISIBLE
                    emptyState.visibility = View.GONE
                }
                is NetworkResult.Success -> {
                    progressBar.visibility = View.GONE
                    val items = result.data ?: emptyList()
                    if (items.isEmpty()) {
                        emptyState.visibility = View.VISIBLE
                        recyclerItems.visibility = View.GONE
                    } else {
                        emptyState.visibility = View.GONE
                        recyclerItems.visibility = View.VISIBLE
                        adapter.submitList(items)
                    }
                }
                is NetworkResult.Error -> {
                    progressBar.visibility = View.GONE
                    emptyState.visibility = View.VISIBLE
                    emptyState.text = result.message
                    Toast.makeText(requireContext(), "Error: ${result.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
        
        viewModel.postResult.observe(viewLifecycleOwner) { result ->
            when (result) {
                is NetworkResult.Loading -> {
                    btnPostGi.isEnabled = false
                    btnPostGi.text = "Posting..."
                }
                is NetworkResult.Success -> {
                    btnPostGi.isEnabled = true
                    btnPostGi.text = "Post Goods Issue"
                    Toast.makeText(requireContext(), result.data, Toast.LENGTH_SHORT).show()
                    viewModel.resetPostResult()
                }
                is NetworkResult.Error -> {
                    btnPostGi.isEnabled = true
                    btnPostGi.text = "Post Goods Issue"
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                    viewModel.resetPostResult()
                }
                null -> {
                    // Reset case
                    btnPostGi.text = "Post Goods Issue"
                    val isCompleted = viewModel.currentObd.value?.GoodsIssueStatus == "C"
                    btnPostGi.isEnabled = !isCompleted
                }
            }
        }
    }
}
