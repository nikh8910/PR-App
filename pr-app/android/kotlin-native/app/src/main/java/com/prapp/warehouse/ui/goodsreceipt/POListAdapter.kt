package com.prapp.warehouse.ui.goodsreceipt

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseOrder

class POListAdapter(private val onClick: (PurchaseOrder) -> Unit) :
    RecyclerView.Adapter<POListAdapter.POViewHolder>() {

    private var items: List<PurchaseOrder> = emptyList()

    fun submitList(newItems: List<PurchaseOrder>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): POViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_po, parent, false)
        return POViewHolder(view, onClick)
    }

    override fun onBindViewHolder(holder: POViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class POViewHolder(itemView: View, val onClick: (PurchaseOrder) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val poNumber: TextView = itemView.findViewById(R.id.text_po_number)
        private val supplier: TextView = itemView.findViewById(R.id.text_supplier)
        private val date: TextView = itemView.findViewById(R.id.text_date)

        fun bind(po: PurchaseOrder) {
            poNumber.text = po.purchaseOrder
            supplier.text = po.supplier ?: "Unknown Supplier"
            date.text = po.purchaseOrderDate?.substringBefore("T") ?: ""
            
            itemView.setOnClickListener { onClick(po) }
        }
    }
}
