package com.prapp.warehouse.ui.availablestock

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.WarehouseStockItem
import com.prapp.warehouse.data.models.WarehouseStorageType
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import com.prapp.warehouse.utils.SharedPrefsManager
import kotlinx.coroutines.launch

class AvailableStockViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = SharedPrefsManager(application)
    private val repository = SapRepository(application)

    val stockItems = MutableLiveData<List<WarehouseStockItem>>()
    val storageTypes = MutableLiveData<List<WarehouseStorageType>>()
    val isLoading = MutableLiveData(false)
    val error = MutableLiveData<String?>(null)
    val taskCreated = MutableLiveData<String?>(null)

    fun fetchStorageTypes(warehouse: String) {
        viewModelScope.launch {
            val result = repository.getWarehouseStorageTypes("EWMWarehouse eq '$warehouse'")
            if (result is NetworkResult.Success) {
                storageTypes.value = result.data?.value ?: emptyList()
            }
        }
    }

    fun searchByBin(warehouse: String, bin: String, storageType: String? = null) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            var filter = "EWMWarehouse eq '$warehouse' and EWMStorageBin eq '$bin'"
            if (!storageType.isNullOrBlank()) filter += " and EWMStorageType eq '$storageType'"
            val result = repository.getWarehouseAvailableStock(filter)
            isLoading.value = false
            when (result) {
                is NetworkResult.Success -> stockItems.value = result.data?.value ?: emptyList()
                else -> error.value = result.message ?: "Failed to fetch stock"
            }
        }
    }

    fun searchByProduct(warehouse: String, product: String) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            val filter = "EWMWarehouse eq '$warehouse' and Product eq '$product'"
            val result = repository.getWarehouseAvailableStock(filter)
            isLoading.value = false
            when (result) {
                is NetworkResult.Success -> stockItems.value = result.data?.value ?: emptyList()
                else -> error.value = result.message ?: "Failed to fetch stock"
            }
        }
    }

    /**
     * Creates an Adhoc Warehouse Task to move stock between bins (drag-drop).
     * Mirrors the bin-to-bin payload from StockByProduct.jsx:handleDDConfirm
     */
    fun createStockMoveTask(
        warehouse: String,
        processType: String,
        sourceItem: WarehouseStockItem,
        destBin: String,
        destStorageType: String,
        quantity: Double
    ) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            taskCreated.value = null

            // Fetch CSRF token first
            val csrfToken = repository.fetchCsrfToken() ?: ""

            val hu = sourceItem.handlingUnitExternalID ?: ""
            val payload: Map<String, Any?> = if (hu.isNotBlank()) {
                mapOf(
                    "EWMWarehouse" to warehouse,
                    "WarehouseProcessType" to processType,
                    "SourceHandlingUnit" to hu,
                    "DestinationStorageType" to destStorageType,
                    "DestinationStorageBin" to destBin
                )
            } else {
                mutableMapOf<String, Any?>(
                    "EWMWarehouse" to warehouse,
                    "WarehouseProcessType" to processType,
                    "Product" to (sourceItem.product ?: ""),
                    "Batch" to (sourceItem.batch ?: ""),
                    "TargetQuantityInAltvUnit" to quantity,
                    "AlternativeUnit" to (sourceItem.ewmStockQuantityBaseUnit ?: "EA"),
                    "EWMStockType" to (sourceItem.ewmStockType ?: "F"),
                    "EWMStockOwner" to (sourceItem.ewmStockOwner ?: ""),
                    "EntitledToDisposeParty" to (sourceItem.ewmStockOwner ?: ""),
                    "SourceStorageType" to (sourceItem.ewmStorageType ?: ""),
                    "SourceStorageBin" to (sourceItem.ewmStorageBin ?: ""),
                    "SourceHandlingUnit" to "",
                    "DestinationStorageType" to destStorageType,
                    "DestinationStorageBin" to destBin,
                    "DestinationHandlingUnit" to ""
                ).also { map ->
                    sourceItem.ewmDocumentCategory?.let { map["EWMDocumentCategory"] = it }
                    sourceItem.ewmStockReferenceDocument?.let { map["EWMStockReferenceDocument"] = it }
                    sourceItem.ewmStockReferenceDocumentItem?.let { map["EWMStockReferenceDocumentItem"] = it }
                }
            }

            val createResult = repository.createWarehouseTask(csrfToken, payload)
            isLoading.value = false
            when (createResult) {
                is NetworkResult.Success -> {
                    val task = createResult.data
                    val taskId = task?.warehouseTask ?: ""
                    val taskItem = task?.warehouseTaskItem ?: ""
                    if (taskId.isNotBlank() && taskItem.isNotBlank()) {
                        // Auto-confirm the task just like the web app does
                        val confirmResult = repository.confirmWarehouseTask(
                            csrfToken = csrfToken,
                            etag = "*",
                            warehouse = warehouse,
                            taskId = taskId,
                            taskItem = taskItem,
                            actionName = "Confirm",
                            payload = mapOf("DirectWhseTaskConfIsAllowed" to true)
                        )
                        if (confirmResult is NetworkResult.Success) {
                            taskCreated.value = "Task $taskId created and confirmed!"
                        } else {
                            taskCreated.value = "Task $taskId created (confirm manually)"
                        }
                    } else {
                        taskCreated.value = "Task created successfully!"
                    }
                }
                else -> error.value = createResult.message ?: "Failed to create warehouse task"
            }
        }
    }

    fun clearError() { error.value = null }
    fun clearTaskCreated() { taskCreated.value = null }
    fun clearStock() { stockItems.value = emptyList() }
}
