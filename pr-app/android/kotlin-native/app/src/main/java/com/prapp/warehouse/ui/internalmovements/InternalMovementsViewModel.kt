package com.prapp.warehouse.ui.internalmovements

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.CreateWarehouseTaskRequest
import com.prapp.warehouse.data.models.WarehouseStorageBin
import com.prapp.warehouse.data.models.WarehouseStorageType
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class InternalMovementsViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    private val _successMessage = MutableLiveData<String?>()
    val successMessage: LiveData<String?> = _successMessage

    private val _storageTypes = MutableLiveData<List<WarehouseStorageType>>()
    val storageTypes: LiveData<List<WarehouseStorageType>> = _storageTypes

    private val _storageBins = MutableLiveData<List<WarehouseStorageBin>>()
    val storageBins: LiveData<List<WarehouseStorageBin>> = _storageBins
    
    fun clearMessages() {
        _error.value = null
        _successMessage.value = null
    }

    fun fetchStorageTypes(warehouse: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val filter = "EWMWarehouse eq '$warehouse'"
                val response = repository.getWarehouseStorageTypes(filter)
                if (response is NetworkResult.Success) {
                    _storageTypes.postValue(response.data?.value ?: emptyList())
                } else {
                    _error.postValue("Failed to fetch storage types: ${response.message}")
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "An unexpected error occurred"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun fetchStorageBins(warehouse: String, storageType: String? = null) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                var filter = "EWMWarehouse eq '$warehouse'"
                if (!storageType.isNullOrBlank()) {
                    filter += " and EWMStorageType eq '${storageType.trim()}'"
                }
                val response = repository.getWarehouseStorageBins(filter)
                if (response is NetworkResult.Success) {
                    _storageBins.postValue(response.data?.value ?: emptyList())
                } else {
                    _error.postValue("Failed to fetch storage bins: ${response.message}")
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "An unexpected error occurred"
            } finally {
                _isLoading.value = false
            }
        }
    }
    
    fun createAdhocTask(
        warehouse: String,
        taskType: String,
        processType: String,
        product: String?,
        quantity: Double?,
        unit: String?,
        stockType: String?,
        srcStorageType: String?,
        srcBin: String?,
        dstStorageType: String?,
        dstBin: String?,
        srcHU: String?,
        dstHU: String?,
        huValue: String?,
        plant: String = "20UK"
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            clearMessages()
            try {
                val request = if (taskType.equals("Product", ignoreCase = true)) {
                    val bp = "S4C_BP_PL${plant.uppercase()}"
                    CreateWarehouseTaskRequest(
                        EWMWarehouse = warehouse,
                        WarehouseProcessType = processType,
                        Product = product?.trim()?.uppercase(),
                        Batch = "",
                        TargetQuantityInAltvUnit = quantity,
                        AlternativeUnit = unit ?: "EA",
                        EWMStockType = stockType ?: "F",
                        EntitledToDisposeParty = bp,
                        EWMStockOwner = bp,
                        SourceStorageType = srcStorageType,
                        SourceStorageBin = srcBin?.trim()?.uppercase(),
                        DestinationStorageType = dstStorageType,
                        DestinationStorageBin = dstBin?.trim()?.uppercase(),
                        SourceHandlingUnit = if (!srcHU.isNullOrBlank()) srcHU.trim().uppercase() else null,
                        DestinationHandlingUnit = if (!dstHU.isNullOrBlank()) dstHU.trim().uppercase() else null
                    )
                } else {
                    CreateWarehouseTaskRequest(
                        EWMWarehouse = warehouse,
                        WarehouseProcessType = processType,
                        SourceHandlingUnit = huValue?.trim()?.uppercase(),
                        DestinationStorageType = dstStorageType,
                        DestinationStorageBin = dstBin?.trim()?.uppercase()
                    )
                }
                
                // Note: repository.createWarehouseTask doesn't take csrfToken anymore in Phase 6 as per SapRepository logic
                val response = repository.createWarehouseTask("", request)
                if (response is NetworkResult.Success) {
                    _successMessage.postValue("Warehouse Task created successfully!")
                } else {
                    _error.postValue("Failed to create task: ${response.message}")
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "An unexpected error occurred"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
