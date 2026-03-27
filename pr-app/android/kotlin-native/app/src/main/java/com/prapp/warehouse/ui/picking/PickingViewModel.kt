package com.prapp.warehouse.ui.picking

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
// Need to make sure WarehouseTask model handles PICK logic 
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PickingViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _taskList = MutableLiveData<NetworkResult<List<WarehouseTask>>>()
    val taskList: LiveData<NetworkResult<List<WarehouseTask>>> = _taskList

    private val _confirmResult = MutableLiveData<NetworkResult<String>>()
    val confirmResult: LiveData<NetworkResult<String>> = _confirmResult

    private val _taskDetail = MutableLiveData<NetworkResult<WarehouseTask>>()
    val taskDetail: LiveData<NetworkResult<WarehouseTask>> = _taskDetail

    fun fetchTasks(warehouse: String, searchValue: String, searchBy: String, shipTo: String = "", dateFrom: String = "", dateTo: String = "") {
        if (warehouse.isBlank()) {
            _taskList.value = NetworkResult.Error("Warehouse is required.")
            return
        }
        
        _taskList.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            try {
                val targetDeliveries = mutableListOf<String>()
                
                // If it's an OBD search with optional filters
                if (searchBy == "OBD" && searchValue.isBlank() && (shipTo.isNotBlank() || dateFrom.isNotBlank() || dateTo.isNotBlank())) {
                    val obdFilterParts = mutableListOf<String>()
                    obdFilterParts.add("EWMWarehouse eq '$warehouse'")
                    if (shipTo.isNotBlank()) obdFilterParts.add("ShipToParty eq '${shipTo.trim()}'")
                    val obdFilter = obdFilterParts.joinToString(" and ")
                    
                    val obdResult = repository.getEwmOutboundDeliveries(obdFilter)
                    
                    if (obdResult is NetworkResult.Success && obdResult.data != null) {
                        val deliveries = obdResult.data.value.mapNotNull { it.EWMOutboundDeliveryOrder }.distinct()
                        if (deliveries.isEmpty()) {
                            _taskList.value = NetworkResult.Error("No deliveries found matching those filters.")
                            return@launch
                        }
                        targetDeliveries.addAll(deliveries.take(40)) 
                    } else {
                        _taskList.value = NetworkResult.Error(obdResult.message ?: "Failed to fetch deliveries for filters.")
                        return@launch
                    }
                } else if (searchBy == "OBD" && searchValue.isNotBlank()) {
                    targetDeliveries.add(searchValue.padStart(10, '0'))
                }

                val filters = mutableListOf<String>()
                filters.add("EWMWarehouse eq '$warehouse'")
                
                if (targetDeliveries.isNotEmpty()) {
                    val delivOrs = targetDeliveries.joinToString(" or ") { "EWMDelivery eq '$it'" }
                    filters.add("($delivOrs)")
                }
                
                if (searchBy == "HU" && searchValue.isNotBlank()) filters.add("HandlingUnit eq '$searchValue'") 
                if (searchBy == "Product" && searchValue.isNotBlank()) filters.add("Product eq '${searchValue.padStart(18, '0')}'")
                
                val filterString = filters.joinToString(" and ")
                
                val result = repository.getWarehouseTasks(filterString)
                if (result is NetworkResult.Success) {
                    val validTasks = result.data?.value?.filter { 
                        (it.warehouseActivityType ?: "").uppercase() == "PICK" 
                    } ?: emptyList()
                    
                    _taskList.value = NetworkResult.Success(validTasks)
                } else {
                    _taskList.value = NetworkResult.Error(result.message ?: "Failed to fetch picking tasks")
                }
            } catch (e: Exception) {
                _taskList.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }

    fun fetchTaskDetail(warehouse: String, taskId: String, taskItem: String) {
        _taskDetail.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                val filter = "EWMWarehouse eq '$warehouse' and WarehouseTask eq '$taskId' and WarehouseTaskItem eq '$taskItem'"
                val result = repository.getWarehouseTasks(filter)
                if (result is NetworkResult.Success) {
                    val task = result.data?.value?.firstOrNull()
                    if (task != null) {
                        _taskDetail.value = NetworkResult.Success(task)
                    } else {
                        _taskDetail.value = NetworkResult.Error("Task not found.")
                    }
                } else {
                    _taskDetail.value = NetworkResult.Error(result.message ?: "Failed to fetch task details")
                }
            } catch (e: Exception) {
                _taskDetail.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }

    fun confirmTask(
        warehouse: String, 
        taskId: String, 
        taskItem: String, 
        actualQty: Double, 
        exceptionCode: String?,
        isExact: Boolean
    ) {
        _confirmResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                val token = repository.fetchCsrfToken() ?: "fetch"
                
                val payload = mutableMapOf<String, Any>()
                payload["DirectWhseTaskConfIsAllowed"] = true
                if (!isExact) {
                    payload["ActualQuantityInAltvUnit"] = actualQty
                    if (!exceptionCode.isNullOrBlank()) {
                        payload["WhseTaskExCodeSrcStorageBin"] = exceptionCode
                    }
                }
                
                val actionName = if (isExact) "ConfirmExactWhseTask" else "ConfirmWhseTaskV2"

                val response = repository.confirmWarehouseTask(
                    csrfToken = token,
                    etag = "*",
                    warehouse = warehouse,
                    taskId = taskId,
                    taskItem = taskItem,
                    actionName = actionName,
                    payload = payload
                )
                
                if (response is NetworkResult.Success) {
                    _confirmResult.value = NetworkResult.Success("Task $taskId confirmed successfully!")
                } else {
                    _confirmResult.value = NetworkResult.Error(response.message ?: "Failed to confirm picking task.")
                }
            } catch (e: Exception) {
                _confirmResult.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
