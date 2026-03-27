package com.prapp.warehouse.ui.goodsissue

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.OutboundDelivery
import com.prapp.warehouse.data.models.OutboundDeliveryItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class GoodsIssueViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    // --- Filter State ---
    private val _filters = MutableLiveData(GIFilters())
    val filters: LiveData<GIFilters> = _filters

    fun setFilters(f: GIFilters) { _filters.value = f }

    // --- Data State ---
    private val _odList = MutableLiveData<NetworkResult<List<OutboundDelivery>>>()
    val odList: LiveData<NetworkResult<List<OutboundDelivery>>> = _odList

    private val _odItems = MutableLiveData<NetworkResult<List<OutboundDeliveryItem>>>()
    val odItems: LiveData<NetworkResult<List<OutboundDeliveryItem>>> = _odItems

    private val _selectedOD = MutableLiveData<OutboundDelivery?>()
    val selectedOD: LiveData<OutboundDelivery?> = _selectedOD

    private val _actionStatus = MutableLiveData<NetworkResult<String>?>()
    val actionStatus: LiveData<NetworkResult<String>?> = _actionStatus

    fun fetchOutboundDeliveries() {
        val f = _filters.value ?: GIFilters()
        val filter = repository.buildODFilter(f.deliveryNumber, f.shippingPoint, f.dateFrom, f.dateTo)
        _odList.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getOutboundDeliveries(filter = filter)
            if (result is NetworkResult.Success) {
                _odList.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _odList.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun fetchODItems(deliveryId: String) {
        _odItems.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getOutboundDeliveryItems(deliveryId)
            if (result is NetworkResult.Success) {
                _odItems.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _odItems.value = NetworkResult.Error(result.message!!)
            }
        }
    }

    fun postGoodsIssue(deliveryId: String, items: List<OutboundDeliveryItem>) {
        _actionStatus.value = NetworkResult.Loading()
        viewModelScope.launch {
            // 1. Fetch CSRF Token
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _actionStatus.value = NetworkResult.Error("Failed to fetch CSRF token")
                return@launch
            }

            // 2. Auto-Pick all items that haven't been picked
            for (item in items) {
                if (item.pickingStatus != "C") {
                    val itemEtag = item.metadata?.etag
                    val pickResult = repository.pickOutboundDeliveryItem(
                        csrfToken, itemEtag, item.deliveryDocument, item.deliveryDocumentItem
                    )
                    if (pickResult is NetworkResult.Error) {
                        _actionStatus.value = NetworkResult.Error(
                            "Failed to pick item ${item.deliveryDocumentItem}: ${pickResult.message}"
                        )
                        return@launch
                    }
                }
            }

            // 3. Post Goods Issue
            val postResult = repository.postGoodsIssueForOD(csrfToken, null, deliveryId)
            if (postResult is NetworkResult.Success) {
                _actionStatus.value = NetworkResult.Success("Goods Issue Posted Successfully!")
            } else if (postResult is NetworkResult.Error) {
                _actionStatus.value = NetworkResult.Error("Post GI Failed: ${postResult.message}")
            }
        }
    }

    fun resetActionStatus() {
        _actionStatus.value = null
    }

    fun selectOD(od: OutboundDelivery) {
        _selectedOD.value = od
    }

    data class GIFilters(
        val deliveryNumber: String = "",
        val shippingPoint: String = "",
        val dateFrom: String = "",
        val dateTo: String = ""
    )
}
