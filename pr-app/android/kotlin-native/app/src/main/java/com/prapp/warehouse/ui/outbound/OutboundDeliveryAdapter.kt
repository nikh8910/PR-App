package com.prapp.warehouse.ui.outbound

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.OutboundDeliveryHeader

class OutboundDeliveryAdapter(
    private val onItemClick: (OutboundDeliveryHeader) -> Unit
) : RecyclerView.Adapter<OutboundDeliveryAdapter.ViewHolder>() {

    private var items = listOf<OutboundDeliveryHeader>()

    fun submitList(newItems: List<OutboundDeliveryHeader>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_obd, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val textDeliveryId: TextView = view.findViewById(R.id.text_delivery_id)
        private val textShipTo: TextView = view.findViewById(R.id.text_ship_to)
        private val textGiStatus: TextView = view.findViewById(R.id.text_gi_status)
        private val textStatus: TextView = view.findViewById(R.id.text_status)

        fun bind(item: OutboundDeliveryHeader) {
            textDeliveryId.text = item.EWMOutboundDeliveryOrder?.trimStart('0') ?: "Unknown"
            textShipTo.text = item.ShipToPartyName ?: item.ShipToParty ?: "N/A"
            textGiStatus.text = item.GoodsIssueStatus ?: "Not Started"
            
            // Map status
            when (item.GoodsIssueStatus) {
                "C" -> {
                    textStatus.text = "Completed"
                    textStatus.setBackgroundResource(R.drawable.bg_status_green)
                    textStatus.setTextColor(android.graphics.Color.parseColor("#15803D"))
                }
                "9" -> { // Assuming 9 or similar is in process
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
