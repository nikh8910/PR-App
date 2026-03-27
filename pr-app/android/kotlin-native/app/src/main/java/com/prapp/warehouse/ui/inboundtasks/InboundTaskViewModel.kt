package com.prapp.warehouse.ui.inboundtasks

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class InboundTaskViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _taskList = MutableLiveData<NetworkResult<List<WarehouseTask>>>()
    val taskList: LiveData<NetworkResult<List<WarehouseTask>>> = _taskList

    fun fetchTasks(warehouse: String, delivery: String, handlingUnit: String, product: String, supplier: String = "", dateFrom: String = "", dateTo: String = "") {
        if (warehouse.isBlank()) {
            _taskList.value = NetworkResult.Error("Warehouse is required.")
            return
        }
        
        _taskList.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            try {
                // If it's an IBD search with optional filters but no specific delivery number
                var deliveryFilter = delivery
                val targetDeliveries = mutableListOf<String>()
                
                if (delivery.isBlank() && handlingUnit.isBlank() && product.isBlank() && (supplier.isNotBlank() || dateFrom.isNotBlank() || dateTo.isNotBlank())) {
                    val ibdFilter = repository.buildIBDFilter(null, supplier, dateFrom, dateTo)
                    val ibdResult = repository.getInboundDeliveries(ibdFilter)
                    
                    if (ibdResult is NetworkResult.Success && ibdResult.data != null) {
                        val deliveries = ibdResult.data.d.results.mapNotNull { it.deliveryDocument }.distinct()
                        if (deliveries.isEmpty()) {
                            _taskList.value = NetworkResult.Error("No deliveries found matching those filters.")
                            return@launch
                        }
                        targetDeliveries.addAll(deliveries.take(40)) // Cap at 40
                    } else {
                        _taskList.value = NetworkResult.Error(ibdResult.message ?: "Failed to fetch deliveries for filters.")
                        return@launch
                    }
                } else if (delivery.isNotBlank()) {
                    targetDeliveries.add(delivery.padStart(10, '0'))
                }

                val filters = mutableListOf<String>()
                filters.add("EWMWarehouse eq '$warehouse'")
                
                if (targetDeliveries.isNotEmpty()) {
                    // OData V2 IN clause: (EWMDelivery eq '1' or EWMDelivery eq '2')
                    val delivOrs = targetDeliveries.joinToString(" or ") { "EWMDelivery eq '$it'" }
                    filters.add("($delivOrs)")
                }
                
                if (handlingUnit.isNotBlank()) filters.add("HandlingUnit eq '$handlingUnit'") 
                if (product.isNotBlank()) filters.add("Product eq '${product.padStart(18, '0')}'")
                
                val filterString = filters.joinToString(" and ")
                
                val result = repository.getWarehouseTasks(filterString)
                if (result is NetworkResult.Success) {
                    val validTasks = result.data?.value?.filter { 
                        (it.warehouseActivityType ?: "").uppercase() != "PICK" 
                    } ?: emptyList()
                    
                    _taskList.value = NetworkResult.Success(validTasks)
                } else {
                    _taskList.value = NetworkResult.Error(result.message ?: "Failed to fetch tasks")
                }
            } catch (e: Exception) {
                _taskList.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
