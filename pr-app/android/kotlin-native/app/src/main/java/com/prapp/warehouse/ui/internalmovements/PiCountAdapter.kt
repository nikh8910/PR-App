package com.prapp.warehouse.ui.internalmovements

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem

class PiCountAdapter(
    private var items: List<EwmPhysicalInventoryItem>,
    private val onItemClick: (EwmPhysicalInventoryItem) -> Unit
) : RecyclerView.Adapter<PiCountAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val textBin: TextView = view.findViewById(R.id.text_pi_bin)
        val textDocInfo: TextView = view.findViewById(R.id.text_pi_doc_info)
        val textStatus: TextView = view.findViewById(R.id.text_pi_status)
        val textProduct: TextView = view.findViewById(R.id.text_pi_product)
        val rootView: View = view
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_pi_count, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.textBin.text = item.EWMStorageBin ?: "No Bin"
        
        val docNum = item.PhysicalInventoryDocNumber?.trimStart('0') ?: ""
        val itemNum = item.PhysicalInventoryItemNumber?.trimStart('0') ?: ""
        holder.textDocInfo.text = "Doc: $docNum / Item: $itemNum"

        val status = item.PhysicalInventoryStatusText ?: "Open"
        holder.textStatus.text = status

        val products = item._WhsePhysicalInventoryCntItem?.mapNotNull { it.Product }?.distinct()?.joinToString(", ")
        holder.textProduct.text = if (products.isNullOrEmpty()) "No Products" else products

        holder.rootView.setOnClickListener {
            onItemClick(item)
        }
    }

    override fun getItemCount() = items.size

    fun updateData(newItems: List<EwmPhysicalInventoryItem>) {
        items = newItems
        notifyDataSetChanged()
    }
}
