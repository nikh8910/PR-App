package com.prapp.warehouse.ui.physicalinventory

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.PhysicalInventoryDoc
import com.prapp.warehouse.data.models.PhysicalInventoryItem
import com.prapp.warehouse.data.models.UpdatePIItemRequest
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PhysicalInventoryViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    // --- Filter State ---
    private val _filters = MutableLiveData(PIFilters())
    val filters: LiveData<PIFilters> = _filters

    fun setFilters(f: PIFilters) { _filters.value = f }

    // --- Data State ---
    private val _piList = MutableLiveData<NetworkResult<List<PhysicalInventoryDoc>>>()
    val piList: LiveData<NetworkResult<List<PhysicalInventoryDoc>>> = _piList

    private val _piItems = MutableLiveData<NetworkResult<List<PhysicalInventoryItem>>>()
    val piItems: LiveData<NetworkResult<List<PhysicalInventoryItem>>> = _piItems

    private val _selectedDoc = MutableLiveData<PhysicalInventoryDoc?>()
    val selectedDoc: LiveData<PhysicalInventoryDoc?> = _selectedDoc

    private val _countPostResult = MutableLiveData<NetworkResult<String>?>()
    val countPostResult: LiveData<NetworkResult<String>?> = _countPostResult

    fun fetchPhysicalInventoryDocs() {
        val f = _filters.value ?: PIFilters()
        val filter = repository.buildPIFilter(f.piDocNumber, f.plant, f.storageLocation)
        _piList.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getPhysicalInventoryDocs(filter = filter)
            if (result is NetworkResult.Success) {
                _piList.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _piList.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun fetchPIItems(piDoc: String, fiscalYear: String) {
        _piItems.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getPhysicalInventoryItems(piDoc, fiscalYear)
            if (result is NetworkResult.Success) {
                _piItems.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _piItems.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun postCount(item: PhysicalInventoryItem, quantity: String) {
        _countPostResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            // 1. Fetch CSRF Token
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _countPostResult.value = NetworkResult.Error("Failed to fetch CSRF token")
                return@launch
            }

            // 2. Fetch Fresh Entity for ETag
            val entityResult = repository.getPhysicalInventoryItem(item.piDocument, item.fiscalYear, item.piItem)
            if (entityResult !is NetworkResult.Success) {
                _countPostResult.value = NetworkResult.Error("Failed to fetch fresh ETag: ${(entityResult as? NetworkResult.Error)?.message}")
                return@launch
            }

            var freshEtag = entityResult.data?.metadata?.etag
            if (freshEtag == null) {
                freshEtag = item.metadata?.etag
                if (freshEtag == null) {
                    _countPostResult.value = NetworkResult.Error("ETag missing (required for posting).")
                    return@launch
                }
            }

            // 3. Perform PATCH
            val payload = UpdatePIItemRequest(quantity = quantity, unit = item.unit)
            val patchResult = repository.updatePhysicalInventoryCount(
                csrfToken, freshEtag, item.piDocument, item.fiscalYear, item.piItem, payload
            )

            if (patchResult is NetworkResult.Success) {
                _countPostResult.value = NetworkResult.Success("Count Posted Successfully!")
                fetchPIItems(item.piDocument, item.fiscalYear)
            } else if (patchResult is NetworkResult.Error) {
                _countPostResult.value = NetworkResult.Error("Post Count Failed: ${patchResult.message}")
            }
        }
    }

    fun resetPostResult() {
        _countPostResult.value = null
    }

    fun selectDoc(doc: PhysicalInventoryDoc) {
        _selectedDoc.value = doc
    }

    data class PIFilters(
        val piDocNumber: String = "",
        val plant: String = "",
        val storageLocation: String = ""
    )
}
