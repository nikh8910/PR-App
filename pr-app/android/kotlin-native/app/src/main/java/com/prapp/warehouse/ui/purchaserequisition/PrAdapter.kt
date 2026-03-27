package com.prapp.warehouse.ui.purchaserequisition

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseRequisition

class PrAdapter(
    private val onItemClick: (PurchaseRequisition) -> Unit
) : ListAdapter<PurchaseRequisition, PrAdapter.PrViewHolder>(PrDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PrViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_purchase_requisition, parent, false)
        return PrViewHolder(view, onItemClick)
    }

    override fun onBindViewHolder(holder: PrViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class PrViewHolder(
        itemView: View,
        val onItemClick: (PurchaseRequisition) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {
        private val tvPrNumber: TextView = itemView.findViewById(R.id.tv_pr_number)
        private val tvPrDescription: TextView = itemView.findViewById(R.id.tv_pr_description)
        private val tvPrDate: TextView = itemView.findViewById(R.id.tv_pr_date)
        private val tvItemCount: TextView = itemView.findViewById(R.id.tv_item_count)

        fun bind(pr: PurchaseRequisition) {
            tvPrNumber.text = "#${pr.PurchaseRequisition}"
            tvPrDescription.text = pr.PurReqnDescription?.takeIf { it.isNotBlank() } ?: "No Description"
            
            // Try to extract date from the first item if available
            val firstItem = pr._PurchaseRequisitionItem?.firstOrNull()
            tvPrDate.text = firstItem?.PurReqCreationDate ?: "N/A"
            
            tvItemCount.text = (pr._PurchaseRequisitionItem?.size ?: 0).toString()

            itemView.setOnClickListener { onItemClick(pr) }
        }
    }

    class PrDiffCallback : DiffUtil.ItemCallback<PurchaseRequisition>() {
        override fun areItemsTheSame(oldItem: PurchaseRequisition, newItem: PurchaseRequisition): Boolean {
            return oldItem.PurchaseRequisition == newItem.PurchaseRequisition
        }

        override fun areContentsTheSame(oldItem: PurchaseRequisition, newItem: PurchaseRequisition): Boolean {
            return oldItem == newItem
        }
    }
}
