package com.prapp.warehouse.ui.outbound

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.EwmOutboundDeliveryItem

class OutboundDeliveryDetailAdapter(
    private val onItemClick: (EwmOutboundDeliveryItem) -> Unit
) : RecyclerView.Adapter<OutboundDeliveryDetailAdapter.ViewHolder>() {

    private var items = listOf<EwmOutboundDeliveryItem>()

    fun submitList(newItems: List<EwmOutboundDeliveryItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_obd_detail, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val textItemNumber: TextView = view.findViewById(R.id.text_item_number)
        private val textProduct: TextView = view.findViewById(R.id.text_product)
        private val textBin: TextView = view.findViewById(R.id.text_bin)
        private val textQty: TextView = view.findViewById(R.id.text_qty)
        private val textStatus: TextView = view.findViewById(R.id.text_status)

        fun bind(item: EwmOutboundDeliveryItem) {
            textItemNumber.text = item.EWMOutboundDeliveryOrderItem?.trimStart('0') ?: "0"
            
            val prod = item.Product ?: "Unknown"
            val desc = item.ProductName ?: item.ProductDescription ?: item.MaterialDescription ?: ""
            textProduct.text = if (desc.isNotEmpty()) "$prod / $desc" else prod

            textBin.text = item.SourceStorageBin ?: item.EWMStorageBin ?: "Not Picked"
            
            val pickedQty = item.DeliveryQuantityInBaseUnit ?: "0" // Fallback if picked not tracked separately
            val targetQty = item.OrderQuantityInBaseUnit ?: item.ProductQuantity ?: "0"
            val unit = item.BaseUnit ?: item.QuantityUnit ?: "PC"
            
            textQty.text = "$pickedQty / $targetQty $unit"

            // Simple status mapping
            val status = item.PickingStatus ?: item.WarehouseProcessingStatus ?: ""
            when (status) {
                "C", "9" -> {
                    textStatus.text = "Completed"
                    textStatus.setBackgroundResource(R.drawable.bg_status_green)
                    textStatus.setTextColor(android.graphics.Color.parseColor("#15803D"))
                }
                "B", "1" -> {
                    textStatus.text = "In Process"
                    textStatus.setBackgroundResource(R.drawable.bg_status_yellow)
                    textStatus.setTextColor(android.graphics.Color.parseColor("#D97706"))
                }
                else -> {
                    textStatus.text = "Not Started"
                    textStatus.setBackgroundResource(R.drawable.bg_status_gray)
                    textStatus.setTextColor(android.graphics.Color.parseColor("#475569"))
                }
            }

            itemView.setOnClickListener { onItemClick(item) }
        }
    }
}
