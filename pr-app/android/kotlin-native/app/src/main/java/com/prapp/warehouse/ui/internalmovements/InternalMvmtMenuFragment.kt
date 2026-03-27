package com.prapp.warehouse.ui.internalmovements

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.prapp.warehouse.R

class InternalMvmtMenuFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_internal_mvmt_menu, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<ImageView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        view.findViewById<ImageView>(R.id.btn_home).setOnClickListener {
            findNavController().navigate(R.id.dashboardFragment)
        }

        view.findViewById<LinearLayout>(R.id.card_adhoc_task_create).setOnClickListener {
            findNavController().navigate(R.id.action_internalMvmtMenu_to_adhocTaskCreate)
        }
        
        view.findViewById<LinearLayout>(R.id.card_adhoc_task_confirm).setOnClickListener {
            findNavController().navigate(R.id.action_internalMvmtMenu_to_adhocTaskConfirm)
        }
        
        view.findViewById<LinearLayout>(R.id.card_pi_count).setOnClickListener {
            findNavController().navigate(R.id.action_internalMvmtMenu_to_piCount)
        }
        
        view.findViewById<LinearLayout>(R.id.card_pi_adhoc_create).setOnClickListener {
            findNavController().navigate(R.id.action_internalMvmtMenu_to_piAdhocCreate)
        }
    }
}
