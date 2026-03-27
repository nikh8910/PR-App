package com.prapp.warehouse.ui.physicalinventory

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PhysicalInventoryDoc

class PIListAdapter(private val onClick: (PhysicalInventoryDoc) -> Unit) :
    RecyclerView.Adapter<PIListAdapter.PIViewHolder>() {

    private var items: List<PhysicalInventoryDoc> = emptyList()

    fun submitList(newItems: List<PhysicalInventoryDoc>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PIViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_pi, parent, false)
        return PIViewHolder(view, onClick)
    }

    override fun onBindViewHolder(holder: PIViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class PIViewHolder(itemView: View, val onClick: (PhysicalInventoryDoc) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val piDoc: TextView = itemView.findViewById(R.id.text_pi_doc)
        private val fiscalYear: TextView = itemView.findViewById(R.id.text_fiscal_year)
        private val details: TextView = itemView.findViewById(R.id.text_details)
        private val date: TextView = itemView.findViewById(R.id.text_date)

        fun bind(doc: PhysicalInventoryDoc) {
            piDoc.text = doc.piDocument
            fiscalYear.text = doc.fiscalYear
            details.text = "Plant: ${doc.plant ?: ""} | Loc: ${doc.storageLocation ?: ""}"
            
            date.text = doc.plannedDate?.run {
                val timestamp = substringAfter("Date(").substringBefore(")")
                try {
                    val date = java.util.Date(timestamp.toLong())
                    java.text.SimpleDateFormat("yyyy-MM-dd").format(date)
                } catch (e: Exception) {
                    this
                }
            } ?: ""
            
            itemView.setOnClickListener { onClick(doc) }
        }
    }
}
