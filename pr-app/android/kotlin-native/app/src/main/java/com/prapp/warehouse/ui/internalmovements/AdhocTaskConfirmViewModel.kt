package com.prapp.warehouse.ui.internalmovements

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class AdhocTaskConfirmViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    private val _taskList = MutableLiveData<NetworkResult<List<WarehouseTask>>>()
    val taskList: LiveData<NetworkResult<List<WarehouseTask>>> = _taskList

    private val _confirmResult = MutableLiveData<NetworkResult<String>>()
    val confirmResult: LiveData<NetworkResult<String>> = _confirmResult

    fun fetchAdhocTasks(warehouse: String, searchValue: String) {
        if (warehouse.isBlank()) {
            _taskList.value = NetworkResult.Error("Warehouse is required.")
            return
        }

        _taskList.value = NetworkResult.Loading()

        viewModelScope.launch {
            try {
                // Fetch tasks for the warehouse
                // We fetch a decent amount and filter client-side like the React app
                val filter = "EWMWarehouse eq '$warehouse'"
                val result = repository.getWarehouseTasks(filter)
                
                if (result is NetworkResult.Success) {
                    var tasks = result.data?.value ?: emptyList()
                    
                    // Filter OUT tasks that are completed (C)
                    tasks = tasks.filter { it.warehouseTaskStatus != "C" }
                    
                    // Filter OUT tasks that have a delivery reference (ad-hoc tasks have no delivery)
                    tasks = tasks.filter {
                        val delivery = it.ewmDelivery?.trim() ?: ""
                        delivery.isEmpty() || delivery.matches(Regex("^0+$"))
                    }

                    // Filter by search string (WT number) if provided
                    if (searchValue.isNotBlank()) {
                        val query = searchValue.trim().uppercase()
                        tasks = tasks.filter { (it.warehouseTask ?: "").uppercase().contains(query) }
                    }

                    _taskList.value = NetworkResult.Success(tasks)
                } else {
                    _taskList.value = NetworkResult.Error(result.message ?: "Failed to fetch tasks")
                }
            } catch (e: Exception) {
                _taskList.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }

    fun confirmAdhocTask(
        warehouse: String,
        taskId: String,
        taskItem: String
    ) {
        _confirmResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                val token = repository.fetchCsrfToken() ?: "fetch"
                
                // Exactly matching the React confirmation payload
                val payload = mapOf("DirectWhseTaskConfIsAllowed" to true)
                
                // For exact confirmation, actionName is ConfirmExactWhseTask
                val actionName = "ConfirmExactWhseTask"

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
                    _confirmResult.value = NetworkResult.Error(response.message ?: "Failed to confirm task.")
                }
            } catch (e: Exception) {
                _confirmResult.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
