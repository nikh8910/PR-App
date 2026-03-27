package com.prapp.warehouse.ui.stockoverview

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.MaterialStock

class StockAdapter : RecyclerView.Adapter<StockAdapter.StockViewHolder>() {

    private var items: List<MaterialStock> = emptyList()

    fun submitList(newItems: List<MaterialStock>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StockViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_stock, parent, false)
        return StockViewHolder(view)
    }

    override fun onBindViewHolder(holder: StockViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class StockViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val materialId: TextView = itemView.findViewById(R.id.text_material_id)
        private val location: TextView = itemView.findViewById(R.id.text_location)
        private val qty: TextView = itemView.findViewById(R.id.text_qty)

        fun bind(item: MaterialStock) {
            materialId.text = item.material
            location.text = "Plant: ${item.plant} | Loc: ${item.storageLocation}"
            qty.text = "${item.quantity} ${item.unit ?: ""}"
        }
    }
}
