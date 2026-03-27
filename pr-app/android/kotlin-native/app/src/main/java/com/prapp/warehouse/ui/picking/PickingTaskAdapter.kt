package com.prapp.warehouse.ui.picking

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.prapp.warehouse.R
import com.prapp.warehouse.data.models.WarehouseTask

class PickingTaskAdapter(private val onItemClick: (WarehouseTask) -> Unit) : RecyclerView.Adapter<PickingTaskAdapter.TaskViewHolder>() {

    private var items: List<WarehouseTask> = emptyList()

    fun submitList(newItems: List<WarehouseTask>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_warehouse_task, parent, false)
        return TaskViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        holder.bind(items[position], onItemClick)
    }

    override fun getItemCount(): Int = items.size

    class TaskViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val textTaskId: TextView = itemView.findViewById(R.id.text_task_id)
        private val textStatus: TextView = itemView.findViewById(R.id.text_status)
        private val textQty: TextView = itemView.findViewById(R.id.text_qty)
        private val textProduct: TextView = itemView.findViewById(R.id.text_product)
        private val textBins: TextView = itemView.findViewById(R.id.text_bins)

        fun bind(task: WarehouseTask, onItemClick: (WarehouseTask) -> Unit) {
            textTaskId.text = "WT: ${task.warehouseTask}"
            
            if (task.warehouseTaskStatus == "C") {
                textStatus.text = "COMPLETED"
                textStatus.setBackgroundColor(Color.parseColor("#E8F5E9")) // Light Green
                textStatus.setTextColor(Color.parseColor("#2E7D32")) // Dark Green
            } else {
                textStatus.text = "OPEN"
                textStatus.setBackgroundColor(Color.parseColor("#FFF3E0")) // Light Orange
                textStatus.setTextColor(Color.parseColor("#E65100")) // Dark Orange
            }

            textQty.text = "Qty: ${task.targetQuantityInBaseUnit ?: "0"} ${task.baseUnit ?: "EA"}"
            textProduct.text = "Product: ${task.product ?: "N/A"}"
            textBins.text = "Src: ${task.sourceStorageBin ?: "ZONE"} -> Dest: ${task.destinationStorageBin ?: "Any Bin"}"
            
            // Allow click only if open
            if (task.warehouseTaskStatus != "C") {
                itemView.setOnClickListener { onItemClick(task) }
                itemView.alpha = 1.0f
            } else {
                itemView.setOnClickListener(null)
                itemView.alpha = 0.6f
            }
        }
    }
}
