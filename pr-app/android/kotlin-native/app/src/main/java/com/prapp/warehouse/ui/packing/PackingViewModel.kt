package com.prapp.warehouse.ui.packing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.HandlingUnit
import com.prapp.warehouse.data.models.HandlingUnitItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PackingViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    val handlingUnits = MutableLiveData<List<HandlingUnit>>()
    val sourceHUItems = MutableLiveData<List<HandlingUnitItem>>()
    val isLoading = MutableLiveData(false)
    val error = MutableLiveData<String?>(null)
    val successMsg = MutableLiveData<String?>(null)
    val createdHUId = MutableLiveData<String?>(null)

    fun loadHandlingUnits(warehouse: String) {
        viewModelScope.launch {
            val result = repository.getHandlingUnits("EWMWarehouse eq '$warehouse'")
            if (result is NetworkResult.Success) {
                handlingUnits.value = result.data?.value ?: emptyList()
            }
        }
    }

    fun loadHUContents(huId: String) {
        viewModelScope.launch {
            isLoading.value = true
            sourceHUItems.value = emptyList()
            val result = repository.getHandlingUnitDetails(huId)
            isLoading.value = false
            if (result is NetworkResult.Success) {
                val items = result.data?.value?.firstOrNull()?.handlingUnitItems ?: emptyList()
                sourceHUItems.value = items
            } else {
                error.value = "Could not load HU contents: ${result.message}"
            }
        }
    }

    /**
     * Create a new empty Handling Unit.
     * Mirrors CreateHU.jsx:handleCreate payload.
     */
    fun createHandlingUnit(
        warehouse: String,
        packagingMaterial: String,
        storageBin: String,
        plant: String? = null,
        storageLocation: String? = null
    ) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            successMsg.value = null
            createdHUId.value = null
            val csrfToken = repository.fetchCsrfToken() ?: ""
            val payload = mutableMapOf<String, Any?>(
                "EWMWarehouse" to warehouse,
                "PackagingMaterial" to packagingMaterial,
                "EWMStorageBin" to storageBin
            ).apply {
                if (!plant.isNullOrBlank()) put("Plant", plant)
                if (!storageLocation.isNullOrBlank()) put("StorageLocation", storageLocation)
            }
            val result = repository.createHandlingUnit(csrfToken, payload)
            isLoading.value = false
            when (result) {
                is NetworkResult.Success -> {
                    val hu = result.data
                    val huId = hu?.handlingUnitExternalID ?: "Created"
                    createdHUId.value = huId
                    successMsg.value = "Handling Unit $huId created successfully!"
                }
                else -> error.value = result.message ?: "Failed to create HU"
            }
        }
    }

    /**
     * Pack a product into an HU.
     * Mirrors PackProduct.jsx:handlePack payload.
     */
    fun packProductToHU(
        warehouse: String,
        huId: String,
        product: String,
        quantity: Double,
        unit: String,
        batch: String?
    ) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            successMsg.value = null
            val csrfToken = repository.fetchCsrfToken() ?: ""
            val item = mutableMapOf<String, Any?>(
                "Material" to product,
                "HandlingUnitQuantity" to quantity,
                "HandlingUnitQuantityUnit" to unit
            ).also { if (!batch.isNullOrBlank()) it["Batch"] = batch }
            val payload = mapOf("_HandlingUnitItem" to listOf(item))
            val result = repository.packProductToHU(csrfToken, huId, warehouse, payload)
            isLoading.value = false
            when (result) {
                is NetworkResult.Success -> successMsg.value = "Product $product packed into HU $huId successfully!"
                else -> error.value = result.message ?: "Pack operation failed"
            }
        }
    }

    /**
     * Repack (transfer) a set of HU items from source HU to dest HU.
     * Mirrors HUTransfer.jsx:handleTransfer — supports full & partial transfers.
     */
    fun repackHUItems(
        warehouse: String,
        sourceHU: String,
        destHU: String,
        itemsToTransfer: List<Triple<HandlingUnitItem, Double, Boolean>> // item, qty, isFullTransfer
    ) {
        viewModelScope.launch {
            isLoading.value = true
            error.value = null
            successMsg.value = null
            val csrfToken = repository.fetchCsrfToken() ?: ""
            val successes = mutableListOf<String>()
            val errors = mutableListOf<String>()

            for ((item, transferQty, isFull) in itemsToTransfer) {
                val stockUUID = item.stockItemUUID
                if (stockUUID.isNullOrBlank()) {
                    val prod = (item.material ?: item.product ?: "?").trimStart('0')
                    errors.add("$prod: No StockItemUUID — cannot transfer")
                    continue
                }
                // Surround UUID in guid'...' format required by OData V4
                val uuidKey = "guid'$stockUUID'"
                val payload: Any = if (isFull) {
                    mapOf("DestinationHandlingUnitExternalID" to destHU)
                } else {
                    mapOf(
                        "DestinationHandlingUnitExternalID" to destHU,
                        "Quantity" to transferQty,
                        "QuantityUnit" to (item.handlingUnitQuantityUnit ?: "EA")
                    )
                }
                val result = repository.repackHUItem(csrfToken, sourceHU, warehouse, uuidKey, payload)
                val prod = (item.material ?: item.product ?: "?").trimStart('0')
                if (result is NetworkResult.Success) {
                    successes.add("$prod  ${transferQty.toInt()} ${item.handlingUnitQuantityUnit ?: "EA"}")
                } else {
                    errors.add("$prod: ${result.message}")
                }
            }

            isLoading.value = false
            if (successes.isNotEmpty()) {
                successMsg.value = "Transferred ${successes.size} item(s) to HU $destHU:\n${successes.joinToString("\n")}"
                // Reload source HU contents
                loadHUContents(sourceHU)
            }
            if (errors.isNotEmpty()) {
                error.value = "Transfer errors:\n${errors.joinToString("\n")}"
            }
        }
    }

    fun clearError() { error.value = null }
    fun clearSuccess() { successMsg.value = null }
    fun clearCreatedHU() { createdHUId.value = null }
}
