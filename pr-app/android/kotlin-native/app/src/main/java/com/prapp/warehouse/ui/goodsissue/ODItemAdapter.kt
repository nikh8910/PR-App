package com.prapp.warehouse.ui.goodsissue

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.graphics.Color
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.OutboundDeliveryItem

class ODItemAdapter : RecyclerView.Adapter<ODItemAdapter.ODItemViewHolder>() {

    private var items: List<OutboundDeliveryItem> = emptyList()

    fun submitList(newItems: List<OutboundDeliveryItem>) {
        items = newItems
        notifyDataSetChanged()
    }
    
    fun getItems(): List<OutboundDeliveryItem> = items

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ODItemViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_od_detail, parent, false)
        return ODItemViewHolder(view)
    }

    override fun onBindViewHolder(holder: ODItemViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class ODItemViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val materialDesc: TextView = itemView.findViewById(R.id.text_material_desc)
        private val materialId: TextView = itemView.findViewById(R.id.text_material_id)
        private val deliveryQty: TextView = itemView.findViewById(R.id.text_delivery_qty)
        private val pickedQty: TextView = itemView.findViewById(R.id.text_picked_qty)
        private val status: TextView = itemView.findViewById(R.id.text_status)

        fun bind(item: OutboundDeliveryItem) {
            materialDesc.text = item.itemText
            materialId.text = item.material
            deliveryQty.text = "${item.deliveryQuantity ?: "-"} ${item.unit}"
            pickedQty.text = "${item.pickedQuantity} ${item.unit}"
            
            when(item.pickingStatus) {
                "C" -> {
                    status.text = "Fully Picked"
                    status.setTextColor(Color.parseColor("#10B981"))
                }
                "B" -> {
                    status.text = "Partially Picked"
                    status.setTextColor(Color.parseColor("#F59E0B"))
                }
                "A" -> {
                    status.text = "Not Picked"
                    status.setTextColor(Color.parseColor("#EF4444"))
                }
                else -> {
                    status.text = item.pickingStatus ?: "Unknown"
                    status.setTextColor(Color.parseColor("#94A3B8"))
                }
            }
        }
    }
}
