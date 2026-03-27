package com.prapp.warehouse.ui.purchaserequisition

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseRequisitionItem

class PrDetailAdapter : ListAdapter<PurchaseRequisitionItem, PrDetailAdapter.ItemViewHolder>(ItemDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ItemViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_pr_detail_entry, parent, false)
        return ItemViewHolder(view)
    }

    override fun onBindViewHolder(holder: ItemViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ItemViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvItemNum: TextView = itemView.findViewById(R.id.tv_item_num)
        private val tvItemTitle: TextView = itemView.findViewById(R.id.tv_item_title)
        private val tvItemSubtitle: TextView = itemView.findViewById(R.id.tv_item_subtitle)
        private val tvItemQty: TextView = itemView.findViewById(R.id.tv_item_qty)
        private val tvItemUom: TextView = itemView.findViewById(R.id.tv_item_uom)

        fun bind(item: PurchaseRequisitionItem) {
            tvItemNum.text = item.PurchaseRequisitionItem
            
            if (!item.Material.isNullOrBlank()) {
                val materialClean = item.Material.replace(Regex("^0+"), "")
                tvItemTitle.text = materialClean
                tvItemSubtitle.text = item.PurchaseRequisitionItemText ?: "Material"
            } else {
                tvItemTitle.text = item.PurchaseRequisitionItemText ?: "Text Item"
                tvItemSubtitle.text = "Material Not Required"
            }

            tvItemQty.text = item.RequestedQuantity ?: "0"
            tvItemUom.text = item.BaseUnit ?: ""
        }
    }

    class ItemDiffCallback : DiffUtil.ItemCallback<PurchaseRequisitionItem>() {
        override fun areItemsTheSame(oldItem: PurchaseRequisitionItem, newItem: PurchaseRequisitionItem): Boolean {
            return oldItem.PurchaseRequisitionItem == newItem.PurchaseRequisitionItem
        }

        override fun areContentsTheSame(oldItem: PurchaseRequisitionItem, newItem: PurchaseRequisitionItem): Boolean {
            return oldItem == newItem
        }
    }
}
