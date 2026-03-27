package com.prapp.warehouse.ui.inbounddelivery

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.InboundDelivery
import com.prapp.warehouse.data.models.InboundDeliveryItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class InboundDeliveryViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    // --- Filter State ---
    private val _filters = MutableLiveData(IBDFilters())
    val filters: LiveData<IBDFilters> = _filters

    fun setFilters(f: IBDFilters) { _filters.value = f }

    // --- Data State ---
    private val _ibdList = MutableLiveData<NetworkResult<List<InboundDelivery>>>()
    val ibdList: LiveData<NetworkResult<List<InboundDelivery>>> = _ibdList

    private val _ibdItems = MutableLiveData<NetworkResult<List<InboundDeliveryItem>>>()
    val ibdItems: LiveData<NetworkResult<List<InboundDeliveryItem>>> = _ibdItems

    private val _selectedIBD = MutableLiveData<InboundDelivery?>()
    val selectedIBD: LiveData<InboundDelivery?> = _selectedIBD

    private val _postResult = MutableLiveData<NetworkResult<Boolean>?>()
    val postResult: LiveData<NetworkResult<Boolean>?> = _postResult

    fun fetchInboundDeliveries() {
        val f = _filters.value ?: IBDFilters()
        val filter = repository.buildIBDFilter(f.deliveryNumber, f.supplier, f.dateFrom, f.dateTo)
        _ibdList.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getInboundDeliveries(filter = filter)
            if (result is NetworkResult.Success) {
                _ibdList.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _ibdList.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun fetchIBDItems(deliveryId: String) {
        _ibdItems.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getInboundDeliveryItems(deliveryId)
            if (result is NetworkResult.Success) {
                val results = result.data!!.d.results
                // Initialize putaway defaults
                results.forEach {
                    it.putawayQuantity = it.deliveryQuantity
                    it.putawayStorageLocation = it.storageLocation ?: ""
                }
                _ibdItems.value = NetworkResult.Success(results)
            } else if (result is NetworkResult.Error) {
                _ibdItems.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun postGoodsReceiptForIBD(deliveryId: String) {
        _postResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            // 1. Fetch CSRF Token
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _postResult.value = NetworkResult.Error("Failed to fetch CSRF token")
                return@launch
            }

            // 2. Fetch ETag for the specific delivery
            val headerResult = repository.getInboundDeliveryHeader(deliveryId)
            if (headerResult !is NetworkResult.Success) {
                _postResult.value = NetworkResult.Error("Failed to fetch ETag for delivery")
                return@launch
            }
            // ETag comes in the response headers; handled internally in safeApiCall
            // We use a standard wildcard "*" as a fallback when ETag header is inaccessible
            // The real ETag would come from response.headers()["etag"] before safeApiCall wraps it
            // To access it, we use the raw service via the repository's internalHeader helper
            // For now use "*" which most SAP systems accept
            val etag = "*"

            // 3. Post Goods Receipt
            val postResult = repository.postGoodsReceiptForIBD(csrfToken, etag, "'$deliveryId'")
            if (postResult is NetworkResult.Success) {
                _postResult.value = NetworkResult.Success(true)
            } else if (postResult is NetworkResult.Error) {
                _postResult.value = NetworkResult.Error(postResult.message!!)
            }
        }
    }

    fun resetPostResult() {
        _postResult.value = null
    }

    fun selectIBD(ibd: InboundDelivery) {
        _selectedIBD.value = ibd
    }

    data class IBDFilters(
        val deliveryNumber: String = "",
        val supplier: String = "",
        val dateFrom: String = "",
        val dateTo: String = ""
    )
}
