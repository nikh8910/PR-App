package com.prapp.warehouse.ui.putaway

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PutawayViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _taskDetail = MutableLiveData<NetworkResult<WarehouseTask>>()
    val taskDetail: LiveData<NetworkResult<WarehouseTask>> = _taskDetail
    
    private val _confirmResult = MutableLiveData<NetworkResult<Any>>()
    val confirmResult: LiveData<NetworkResult<Any>> = _confirmResult

    fun fetchTaskDetail(warehouse: String, taskId: String, taskItem: String) {
        _taskDetail.value = NetworkResult.Loading()
        viewModelScope.launch {
            // Re-fetch using list approach for MVP since direct key fetch isn't explicitly defined
            val filters = "EWMWarehouse eq '$warehouse' and WarehouseTask eq '$taskId' and WarehouseTaskItem eq '$taskItem'"
            val result = repository.getWarehouseTasks(filters)
            
            if (result is NetworkResult.Success && !result.data?.value.isNullOrEmpty()) {
                _taskDetail.value = NetworkResult.Success(result.data!!.value.first())
            } else {
                _taskDetail.value = NetworkResult.Error(result.message ?: "Task not found")
            }
        }
    }

    fun confirmPutaway(
        warehouse: String, 
        taskId: String, 
        taskItem: String,
        actualQty: Double,
        destBin: String,
        destType: String,
        exceptionCode: String,
        destHu: String,
        plannedQty: Double,
        plannedBin: String,
        baseUnit: String
    ) {
        _confirmResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _confirmResult.value = NetworkResult.Error("Failed to fetch CSRF Token")
                return@launch
            }

            val isExact = exceptionCode.isEmpty() && destBin.equals(plannedBin, ignoreCase = true) && actualQty == plannedQty

            val payload = mutableMapOf<String, Any>()
            payload["DirectWhseTaskConfIsAllowed"] = true

            if (!isExact) {
                payload["ActualQuantityInAltvUnit"] = actualQty
                payload["AlternativeUnit"] = baseUnit
                payload["DestinationStorageBin"] = destBin.uppercase()
                if (exceptionCode.isNotBlank()) {
                    payload["WhseTaskExCodeDestStorageBin"] = exceptionCode
                }
            }

            if (destHu.isNotBlank()) {
                payload["DestinationHandlingUnit"] = destHu
            }

            // Provide SAP keys in header payload per SapApiService definition
            // Wait, SapApiService for confirmWarehouseTask is:
            // suspend fun confirmWarehouseTask(client, csrfToken, payload: Any): Response<Any>
            // We need to inject keys or use the correct endpoint format
            // Our Retrofit endpoint:
            // @POST("/sap/opu/odata4/sap/api_warehouse_order_task_2/srvd_a2x/sap/warehouseorder/0001/WarehouseTaskConfirm")
            
            val result = repository.confirmWarehouseTask(
                csrfToken = csrfToken,
                etag = "*", // Putaway task confirmation usually accepts * or requires ETag fetching. Using * for MVP.
                warehouse = warehouse,
                taskId = taskId,
                taskItem = taskItem,
                actionName = "ConfirmWarehouseTask",
                payload = payload
            )
            if (result is NetworkResult.Success) {
                _confirmResult.value = NetworkResult.Success(Any())
            } else {
                _confirmResult.value = NetworkResult.Error(result.message ?: "Failed to confirm task")
            }
        }
    }
}
