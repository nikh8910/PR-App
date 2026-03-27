package com.prapp.warehouse.ui.handlingunits

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.HandlingUnit
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class HandlingUnitsViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _huList = MutableLiveData<NetworkResult<List<HandlingUnit>>>()
    val huList: LiveData<NetworkResult<List<HandlingUnit>>> = _huList
    
    fun fetchHandlingUnits(huId: String, plant: String, sloc: String) {
        var filter = ""
        val filters = mutableListOf<String>()
        if (huId.isNotBlank()) filters.add("HandlingUnitExternalID eq '$huId'")
        // Plant/SLoc logic depends on OData V4 structure. For now, filter on HU ID if provided.
        // Actually Handling Units are often queried by top level ID in SAP EWM. 
        if (filters.isNotEmpty()) {
            filter = filters.joinToString(" and ")
        }
        
        _huList.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            val result = repository.getHandlingUnits(filter.ifEmpty { null })
            if (result is NetworkResult.Success) {
                // HandlingUnit response from OData V4 contains "value" instead of "d.results"
                _huList.value = NetworkResult.Success(result.data?.value ?: emptyList())
            } else {
                _huList.value = NetworkResult.Error(result.message ?: "Failed to fetch HUs")
            }
        }
    }

    private val _createResult = MutableLiveData<NetworkResult<HandlingUnit>>()
    val createResult: LiveData<NetworkResult<HandlingUnit>> = _createResult

    fun createHandlingUnit(packagingMaterial: String, plant: String, sloc: String) {
        if (packagingMaterial.isBlank() || plant.isBlank()) {
            _createResult.value = NetworkResult.Error("Packaging Material and Plant are required")
            return
        }
        
        _createResult.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _createResult.value = NetworkResult.Error("Failed to fetch CSRF Token")
                return@launch
            }
            
            val payload = com.prapp.warehouse.data.models.CreateHandlingUnitRequest(
                PackagingMaterial = packagingMaterial,
                Plant = plant,
                StorageLocation = sloc.ifBlank { null }
            )
            
            val result = repository.createHandlingUnit(csrfToken, payload)
            if (result is NetworkResult.Success && result.data != null) {
                _createResult.value = NetworkResult.Success(result.data)
                // Optionally re-fetch the list if needed, or caller can handle
            } else {
                _createResult.value = NetworkResult.Error(result.message ?: "Failed to create HU")
            }
        }
    }
}
