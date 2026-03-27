package com.prapp.warehouse.ui.goodsissue

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.OutboundDelivery

class ODListAdapter(private val onClick: (OutboundDelivery) -> Unit) :
    RecyclerView.Adapter<ODListAdapter.ODViewHolder>() {

    private var items: List<OutboundDelivery> = emptyList()

    fun submitList(newItems: List<OutboundDelivery>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ODViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_od, parent, false)
        return ODViewHolder(view, onClick)
    }

    override fun onBindViewHolder(holder: ODViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class ODViewHolder(itemView: View, val onClick: (OutboundDelivery) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val odNumber: TextView = itemView.findViewById(R.id.text_od_number)
        private val status: TextView = itemView.findViewById(R.id.text_status)
        private val date: TextView = itemView.findViewById(R.id.text_date)

        fun bind(od: OutboundDelivery) {
            odNumber.text = od.deliveryDocument
            status.text = "Status: ${od.overallStatus ?: "N/A"}"
            date.text = od.deliveryDate?.run {
                val timestamp = substringAfter("Date(").substringBefore(")")
                try {
                    val date = java.util.Date(timestamp.toLong())
                    java.text.SimpleDateFormat("yyyy-MM-dd").format(date)
                } catch (e: Exception) {
                    this
                }
            } ?: ""
            
            itemView.setOnClickListener { onClick(od) }
        }
    }
}
