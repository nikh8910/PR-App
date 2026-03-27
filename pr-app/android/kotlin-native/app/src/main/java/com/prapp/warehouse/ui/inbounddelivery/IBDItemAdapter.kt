package com.prapp.warehouse.ui.inbounddelivery

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.EditText
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.InboundDeliveryItem

class IBDItemAdapter(private val onDataChanged: (InboundDeliveryItem) -> Unit) :
    RecyclerView.Adapter<IBDItemAdapter.IBDItemViewHolder>() {

    private var items: List<InboundDeliveryItem> = emptyList()

    fun submitList(newItems: List<InboundDeliveryItem>) {
        items = newItems
        notifyDataSetChanged()
    }
    
    fun getItems(): List<InboundDeliveryItem> = items

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): IBDItemViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_ibd_detail, parent, false)
        return IBDItemViewHolder(view, onDataChanged)
    }

    override fun onBindViewHolder(holder: IBDItemViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class IBDItemViewHolder(itemView: View, val onDataChanged: (InboundDeliveryItem) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val materialDesc: TextView = itemView.findViewById(R.id.text_material_desc)
        private val materialId: TextView = itemView.findViewById(R.id.text_material_id)
        private val deliveryQty: TextView = itemView.findViewById(R.id.text_delivery_qty)
        private val editPutawayQty: EditText = itemView.findViewById(R.id.edit_putaway_qty)
        private val editStorageLoc: EditText = itemView.findViewById(R.id.edit_storage_loc)

        fun bind(item: InboundDeliveryItem) {
            materialDesc.text = item.itemText
            materialId.text = item.material
            deliveryQty.text = "${item.deliveryQuantity} ${item.unit}"
            
            editPutawayQty.onFocusChangeListener = null
            editStorageLoc.onFocusChangeListener = null
            
            if (editPutawayQty.text.toString() != item.putawayQuantity) {
                 editPutawayQty.setText(item.putawayQuantity)
            }
            if (editStorageLoc.text.toString() != item.putawayStorageLocation) {
                editStorageLoc.setText(item.putawayStorageLocation)
            }
            
            editPutawayQty.setOnFocusChangeListener { _, hasFocus ->
                if (!hasFocus) {
                    item.putawayQuantity = editPutawayQty.text.toString()
                    onDataChanged(item)
                }
            }
            
            editStorageLoc.setOnFocusChangeListener { _, hasFocus ->
                if (!hasFocus) {
                    item.putawayStorageLocation = editStorageLoc.text.toString()
                    onDataChanged(item)
                }
            }
        }
    }
}
