package com.prapp.warehouse.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import com.prapp.warehouse.R
import com.prapp.warehouse.ui.login.LoginActivity
import com.prapp.warehouse.utils.SharedPrefsManager

class DashboardFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_dashboard, container, false)
        
        // Setup Welcome Text
        val prefs = SharedPrefsManager(requireContext())
        val username = prefs.getUsername() ?: "User"
        view.findViewById<android.widget.TextView>(R.id.text_welcome)?.text = "Welcome, $username"
        
        // Modules Navigation - Inventory
        view.findViewById<LinearLayout>(R.id.card_goods_receipt).setOnClickListener {
            androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_goodsReceipt)
        }
        view.findViewById<LinearLayout>(R.id.card_goods_issue).setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_goodsIssue)
        }
        view.findViewById<LinearLayout>(R.id.card_physical_inventory).setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_physicalInventory)
        }
        view.findViewById<LinearLayout>(R.id.card_stock_overview).setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_stockOverview)
        }
        view.findViewById<LinearLayout>(R.id.card_purchase_req)?.setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_prList)
        }

        // Modules Navigation - Warehouse
        view.findViewById<LinearLayout>(R.id.card_inbound)?.setOnClickListener {
             // In Phase 1 we styled InboundTaskFragment to match React's 'Inbound' module
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_inboundTasks)
        }
        view.findViewById<LinearLayout>(R.id.card_outbound)?.setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_obdSearch)
        }
        view.findViewById<LinearLayout>(R.id.card_internal_movement)?.setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_moveStock)
        }
        view.findViewById<LinearLayout>(R.id.card_available_stock)?.setOnClickListener {
            val options = arrayOf("Stock by Bin", "Stock by Product")
            android.app.AlertDialog.Builder(requireContext())
                .setTitle("Available Stock")
                .setItems(options) { _, which ->
                    val dest = if (which == 0) R.id.action_dashboard_to_stockByBin
                               else R.id.action_dashboard_to_stockByProduct
                    androidx.navigation.Navigation.findNavController(view).navigate(dest)
                }.show()
        }
        view.findViewById<LinearLayout>(R.id.card_packing)?.setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_handlingUnits)
        }
        view.findViewById<LinearLayout>(R.id.card_picking)?.setOnClickListener {
             androidx.navigation.Navigation.findNavController(view).navigate(R.id.action_dashboard_to_pickingSearch)
        }

        // Accordion functionality for Inventory
        val sectionInventoryHeader = view.findViewById<LinearLayout>(R.id.section_inventory_header)
        val gridInventory = view.findViewById<GridLayout>(R.id.grid_inventory)
        val iconInventoryToggle = view.findViewById<ImageView>(R.id.icon_inventory_toggle)
        
        sectionInventoryHeader.setOnClickListener {
            if (gridInventory.visibility == View.VISIBLE) {
                gridInventory.visibility = View.GONE
                iconInventoryToggle.setImageResource(android.R.drawable.arrow_down_float)
            } else {
                gridInventory.visibility = View.VISIBLE
                iconInventoryToggle.setImageResource(android.R.drawable.arrow_up_float)
            }
        }

        // Accordion functionality for Warehouse
        val sectionWarehouseHeader = view.findViewById<LinearLayout>(R.id.section_warehouse_header)
        val gridWarehouse = view.findViewById<GridLayout>(R.id.grid_warehouse)
        val iconWarehouseToggle = view.findViewById<ImageView>(R.id.icon_warehouse_toggle)
        
        sectionWarehouseHeader.setOnClickListener {
            if (gridWarehouse.visibility == View.VISIBLE) {
                gridWarehouse.visibility = View.GONE
                iconWarehouseToggle.setImageResource(android.R.drawable.arrow_down_float)
            } else {
                gridWarehouse.visibility = View.VISIBLE
                iconWarehouseToggle.setImageResource(android.R.drawable.arrow_up_float)
            }
        }

        // Logout
        view.findViewById<ImageView>(R.id.btn_logout).setOnClickListener {
            // Clear credentials
            SharedPrefsManager(requireContext()).clear()
            
            // Navigate to Login Activity and clear backstack
            val intent = Intent(requireContext(), LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            requireActivity().finish()
        }

        return view
    }
}
