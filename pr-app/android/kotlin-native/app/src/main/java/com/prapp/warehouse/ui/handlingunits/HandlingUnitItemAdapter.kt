package com.prapp.warehouse.ui.handlingunits

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.data.models.HandlingUnitItem

class HandlingUnitItemAdapter : RecyclerView.Adapter<HandlingUnitItemAdapter.HUItemViewHolder>() {

    private var items: List<HandlingUnitItem> = emptyList()

    fun submitList(newItems: List<HandlingUnitItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): HUItemViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(android.R.layout.simple_list_item_2, parent, false)
        return HUItemViewHolder(view)
    }

    override fun onBindViewHolder(holder: HUItemViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class HUItemViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val text1: TextView = itemView.findViewById(android.R.id.text1)
        private val text2: TextView = itemView.findViewById(android.R.id.text2)

        fun bind(item: HandlingUnitItem) {
            text1.text = "Material: ${item.material ?: item.product ?: "Unknown"}" // API often returns Product
            text2.text = "Qty: ${item.handlingUnitQuantity ?: item.quantity ?: "0"} ${item.handlingUnitQuantityUnit ?: item.quantityUnit ?: "EA"}"
        }
    }
}
