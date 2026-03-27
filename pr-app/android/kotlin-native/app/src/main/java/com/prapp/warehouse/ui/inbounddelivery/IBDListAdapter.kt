package com.prapp.warehouse.ui.inbounddelivery

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.InboundDelivery

class IBDListAdapter(private val onClick: (InboundDelivery) -> Unit) :
    RecyclerView.Adapter<IBDListAdapter.IBDViewHolder>() {

    private var items: List<InboundDelivery> = emptyList()

    fun submitList(newItems: List<InboundDelivery>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): IBDViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_ibd, parent, false)
        return IBDViewHolder(view, onClick)
    }

    override fun onBindViewHolder(holder: IBDViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class IBDViewHolder(itemView: View, val onClick: (InboundDelivery) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val ibdNumber: TextView = itemView.findViewById(R.id.text_ibd_number)
        private val status: TextView = itemView.findViewById(R.id.text_status)
        private val date: TextView = itemView.findViewById(R.id.text_date)

        fun bind(ibd: InboundDelivery) {
            ibdNumber.text = ibd.deliveryDocument
            status.text = "Status: ${ibd.overallStatus ?: "N/A"}"
            date.text = ibd.deliveryDate?.run {
                val timestamp = substringAfter("Date(").substringBefore(")")
                try {
                    val date = java.util.Date(timestamp.toLong())
                    java.text.SimpleDateFormat("yyyy-MM-dd").format(date)
                } catch (e: Exception) {
                    this
                }
            } ?: ""
            
            itemView.setOnClickListener { onClick(ibd) }
        }
    }
}
