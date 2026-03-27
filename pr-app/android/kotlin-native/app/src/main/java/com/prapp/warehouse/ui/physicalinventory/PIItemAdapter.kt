package com.prapp.warehouse.ui.physicalinventory

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.PhysicalInventoryItem

class PIItemAdapter(private val onSaveClick: (PhysicalInventoryItem, String) -> Unit) :
    RecyclerView.Adapter<PIItemAdapter.PIItemViewHolder>() {

    private var items: List<PhysicalInventoryItem> = emptyList()

    fun submitList(newItems: List<PhysicalInventoryItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PIItemViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_pi_detail, parent, false)
        return PIItemViewHolder(view, onSaveClick)
    }

    override fun onBindViewHolder(holder: PIItemViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class PIItemViewHolder(itemView: View, val onSaveClick: (PhysicalInventoryItem, String) -> Unit) : RecyclerView.ViewHolder(itemView) {
        private val materialId: TextView = itemView.findViewById(R.id.text_material_id)
        private val info: TextView = itemView.findViewById(R.id.text_info)
        private val inputQty: EditText = itemView.findViewById(R.id.input_count_qty)
        private val btnSave: Button = itemView.findViewById(R.id.btn_save_count)

        fun bind(item: PhysicalInventoryItem) {
            materialId.text = item.material
            info.text = "Batch: ${item.batch ?: "-"} | Item: ${item.piItem}"
            
            // If already counted, show it
            if (item.quantity != null) {
                inputQty.setText(item.quantity)
            } else {
                inputQty.setText("")
            }
            
            btnSave.setOnClickListener {
                val qty = inputQty.text.toString()
                if (qty.isNotEmpty()) {
                    onSaveClick(item, qty)
                }
            }
        }
    }
}
