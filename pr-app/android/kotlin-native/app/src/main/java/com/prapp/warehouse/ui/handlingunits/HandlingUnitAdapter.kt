package com.prapp.warehouse.ui.handlingunits

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.HandlingUnit

class HandlingUnitAdapter(private val onItemClick: (HandlingUnit) -> Unit) : RecyclerView.Adapter<HandlingUnitAdapter.HUViewHolder>() {

    private var items: List<HandlingUnit> = emptyList()

    fun submitList(newItems: List<HandlingUnit>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): HUViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_handling_unit, parent, false)
        return HUViewHolder(view)
    }

    override fun onBindViewHolder(holder: HUViewHolder, position: Int) {
        holder.bind(items[position], onItemClick)
    }

    override fun getItemCount(): Int = items.size

    class HUViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val textHuId: TextView = itemView.findViewById(R.id.text_hu_id)
        private val textLocation: TextView = itemView.findViewById(R.id.text_location)
        private val textDetails: TextView = itemView.findViewById(R.id.text_details)

        fun bind(item: HandlingUnit, onItemClick: (HandlingUnit) -> Unit) {
            textHuId.text = item.handlingUnitExternalID
            textLocation.text = "Plant: ${item.plant ?: "N/A"} | SLoc: ${item.storageLocation ?: "N/A"}"
            textDetails.text = "Material: ${item.packagingMaterial ?: "Unknown"}"
            
            itemView.setOnClickListener { onItemClick(item) }
        }
    }
}
