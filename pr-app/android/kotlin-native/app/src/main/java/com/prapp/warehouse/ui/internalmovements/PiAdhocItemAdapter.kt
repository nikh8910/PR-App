package com.prapp.warehouse.ui.internalmovements

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem

class PiAdhocItemAdapter(
    private var items: List<EwmPhysicalInventoryItem>,
    private val onRemoveClick: (Int) -> Unit
) : RecyclerView.Adapter<PiAdhocItemAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val textBin: TextView = view.findViewById(R.id.text_item_bin)
        val textDetails: TextView = view.findViewById(R.id.text_item_details)
        val textIndex: TextView = view.findViewById(R.id.text_item_index)
        val btnRemove: ImageButton = view.findViewById(R.id.btn_remove_item)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_pi_adhoc_create, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.textIndex.text = (position + 1).toString()
        holder.textBin.text = item.EWMStorageBin ?: ""

        val detailsList = mutableListOf<String>()
        if (!item.EWMStorageType.isNullOrBlank()) detailsList.add("Type: ${item.EWMStorageType}")
        if (!item.Product.isNullOrBlank()) detailsList.add("Prod: ${item.Product}")
        if (!item.Batch.isNullOrBlank()) detailsList.add("Batch: ${item.Batch}")
        if (!item.EWMPhysInvtryReason.isNullOrBlank()) detailsList.add("Reason: ${item.EWMPhysInvtryReason}")

        holder.textDetails.text = detailsList.joinToString(" • ")
        holder.textDetails.visibility = if (detailsList.isEmpty()) View.GONE else View.VISIBLE

        holder.btnRemove.setOnClickListener {
            onRemoveClick(position)
        }
    }

    override fun getItemCount() = items.size

    fun updateData(newItems: List<EwmPhysicalInventoryItem>) {
        items = newItems
        notifyDataSetChanged()
    }
}
