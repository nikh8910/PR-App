package com.prapp.warehouse.ui.packing

import android.os.Bundle
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.prapp.warehouse.R

/**
 * PackingMenuFragment — landing menu for EWM Packing / Handling Unit operations.
 * Mirrors WarehousePacking.jsx (3 navigation tiles: HU Transfer, Pack Product, Create HU).
 */
class PackingMenuFragment : Fragment(R.layout.fragment_packing_menu) {

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<ImageView>(R.id.btn_back)?.setOnClickListener {
            findNavController().popBackStack()
        }
        view.findViewById<ImageView>(R.id.btn_home)?.setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        view.findViewById<LinearLayout>(R.id.tile_hu_transfer)?.setOnClickListener {
            findNavController().navigate(R.id.action_packingMenu_to_huTransfer)
        }
        view.findViewById<LinearLayout>(R.id.tile_pack_product)?.setOnClickListener {
            findNavController().navigate(R.id.action_packingMenu_to_packProduct)
        }
        view.findViewById<LinearLayout>(R.id.tile_create_hu)?.setOnClickListener {
            findNavController().navigate(R.id.action_packingMenu_to_createHU)
        }
    }
}
