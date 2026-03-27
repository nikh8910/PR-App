package com.prapp.warehouse.ui.movestock

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.MoveStockData
import com.prapp.warehouse.data.models.MoveStockItem
import com.prapp.warehouse.data.models.MoveStockRequest
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MoveStockViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _moveResult = MutableLiveData<NetworkResult<String>>()
    val moveResult: LiveData<NetworkResult<String>> = _moveResult
    
    fun postStockMovement(
        material: String,
        srcPlant: String,
        srcSloc: String,
        dstPlant: String,
        dstSloc: String,
        qty: String,
        mvtType: String
    ) {
        if (material.isBlank() || srcPlant.isBlank() || qty.isBlank()) {
            _moveResult.value = NetworkResult.Error("Material, Source Plant, and Quantity are required")
            return
        }

        _moveResult.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _moveResult.value = NetworkResult.Error("Failed to fetch CSRF Token")
                return@launch
            }
            
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'00:00:00", Locale.getDefault())
            val dateStr = sdf.format(Date())
            
            // Usually destination plant is required for 301, and sloc for 311. We just pass what user provided.
            val item = MoveStockItem(
                Material = material,
                Plant = srcPlant,
                StorageLocation = srcSloc.ifBlank { null },
                IssuingOrReceivingPlant = dstPlant.ifBlank { null },
                IssuingOrReceivingStorageLoc = dstSloc.ifBlank { null },
                GoodsMovementType = mvtType,
                QuantityInEntryUnit = qty,
                EntryUnit = "EA" // Hardcoded EA for simplicity, can be dynamic
            )
            
            val request = MoveStockRequest(
                d = MoveStockData(
                    DocumentDate = dateStr,
                    PostingDate = dateStr,
                    to_MaterialDocumentItem = listOf(item)
                )
            )
            
            val result = repository.postStockMovement(csrfToken, request)
            if (result is NetworkResult.Success) {
                _moveResult.value = NetworkResult.Success("Stock movement posted successfully")
            } else {
                _moveResult.value = NetworkResult.Error(result.message ?: "Failed to post movement")
            }
        }
    }
}
