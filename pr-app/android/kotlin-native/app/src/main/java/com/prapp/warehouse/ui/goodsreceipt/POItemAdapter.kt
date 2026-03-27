package com.prapp.warehouse.ui.goodsreceipt

import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.EditText
import androidx.recyclerview.widget.RecyclerView
import android.util.Log
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PurchaseOrderItem

class POItemAdapter(private val onDataChanged: (PurchaseOrderItem) -> Unit) :
    RecyclerView.Adapter<POItemAdapter.POItemViewHolder>() {

    private var items: List<PurchaseOrderItem> = emptyList()

    fun submitList(newItems: List<PurchaseOrderItem>) {
        items = newItems
        notifyDataSetChanged()
    }
    
    fun getItems(): List<PurchaseOrderItem> = items

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): POItemViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_po_detail, parent, false)
        return POItemViewHolder(view, onDataChanged)
    }

    override fun onBindViewHolder(holder: POItemViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class POItemViewHolder(itemView: View, val onDataChanged: (PurchaseOrderItem) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val materialDesc: TextView = itemView.findViewById(R.id.text_material_desc)
        private val materialId: TextView = itemView.findViewById(R.id.text_material_id)
        private val orderedQty: TextView = itemView.findViewById(R.id.text_ordered_qty)
        private val editGrQty: EditText = itemView.findViewById(R.id.edit_gr_qty)
        private val editStorageLoc: EditText = itemView.findViewById(R.id.edit_storage_loc)

        fun bind(item: PurchaseOrderItem) {
            materialDesc.text = item.itemText
            materialId.text = item.material
            orderedQty.text = "${item.orderQuantity} ${item.unit}"
            
            // Remove listeners before setting text to avoid infinite loops/updates during scrolling
            editGrQty.onFocusChangeListener = null
            editStorageLoc.onFocusChangeListener = null
            
            // Set current values
            if (editGrQty.text.toString() != item.grQuantity) {
                 editGrQty.setText(item.grQuantity)
            }
            if (editStorageLoc.text.toString() != item.grStorageLocation) {
                editStorageLoc.setText(item.grStorageLocation)
            }
            
            // Logic to update model when text changes
            // Simple approach using Focus/Text watcher
            editGrQty.setOnFocusChangeListener { _, hasFocus ->
                if (!hasFocus) {
                    item.grQuantity = editGrQty.text.toString()
                    onDataChanged(item)
                }
            }
            
            editStorageLoc.setOnFocusChangeListener { _, hasFocus ->
                if (!hasFocus) {
                    item.grStorageLocation = editStorageLoc.text.toString()
                    onDataChanged(item)
                }
            }
        }
    }
}
