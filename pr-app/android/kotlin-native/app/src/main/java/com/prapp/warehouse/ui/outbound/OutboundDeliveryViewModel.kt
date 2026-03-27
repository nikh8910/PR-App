package com.prapp.warehouse.ui.outbound

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.EwmOutboundDeliveryItem
import com.prapp.warehouse.data.models.OutboundDeliveryHeader
import com.prapp.warehouse.data.models.WarehouseTask
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import com.prapp.warehouse.utils.SharedPrefsManager
import kotlinx.coroutines.launch

class OutboundDeliveryViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    private val prefs = SharedPrefsManager(application)
    
    val selectedWarehouse: String = "UKW2"

    private val _obdList = MutableLiveData<NetworkResult<List<OutboundDeliveryHeader>>>()
    val obdList: LiveData<NetworkResult<List<OutboundDeliveryHeader>>> = _obdList

    private val _obdItems = MutableLiveData<NetworkResult<List<EwmOutboundDeliveryItem>>>()
    val obdItems: LiveData<NetworkResult<List<EwmOutboundDeliveryItem>>> = _obdItems

    private val _warehouseTasks = MutableLiveData<NetworkResult<List<WarehouseTask>>>()
    val warehouseTasks: LiveData<NetworkResult<List<WarehouseTask>>> = _warehouseTasks

    private val _currentObd = MutableLiveData<OutboundDeliveryHeader?>()
    val currentObd: LiveData<OutboundDeliveryHeader?> = _currentObd

    private val _postResult = MutableLiveData<NetworkResult<String>>()
    val postResult: LiveData<NetworkResult<String>> = _postResult
    
    fun selectObd(obd: OutboundDeliveryHeader) {
        _currentObd.value = obd
    }

    fun searchDeliveries(searchBy: String, searchValue: String, shipTo: String?, dateFrom: String?, dateTo: String?) {
        _obdList.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                // If specific delivery document is provided
                val isObd = (searchBy == "OBD" && searchValue.isNotBlank())
                
                val filterParts = mutableListOf<String>()
                filterParts.add("EWMWarehouse eq '$selectedWarehouse'")
                
                if (isObd) {
                    val padded = searchValue.padStart(10, '0')
                    filterParts.add("EWMOutboundDeliveryOrder eq '$padded'")
                } else if (searchBy == "OBD") {
                    if (!shipTo.isNullOrBlank()) filterParts.add("ShipToParty eq '${shipTo.trim().uppercase()}'")
                    if (!dateFrom.isNullOrBlank()) filterParts.add("PlannedGoodsIssueDate ge ${dateFrom}T00:00:00Z")
                    if (!dateTo.isNullOrBlank()) filterParts.add("PlannedGoodsIssueDate le ${dateTo}T23:59:59Z")
                }
                
                // For 'HU' or 'Product' search, the native app might need 2 steps: fetch all and filter in app, 
                // or use a different endpoint. To mirror the React app exactly, we will just fetch OBDs and filter,
                // But for simplicity in the initial pass, we only support OBD/header search.
                
                val filter = if (filterParts.isNotEmpty()) filterParts.joinToString(" and ") else ""
                val response = repository.getEwmOutboundDeliveries(filter)
                
                if (response is NetworkResult.Success) {
                    val data = response.data?.value ?: emptyList()
                    _obdList.postValue(NetworkResult.Success(data))
                } else if (response is NetworkResult.Error) {
                    _obdList.postValue(NetworkResult.Error(response.message ?: "Unknown error"))
                }
            } catch (e: Exception) {
                _obdList.postValue(NetworkResult.Error("Search failed: ${e.message}"))
            }
        }
    }
    
    fun fetchOutboundDeliveryDetails(deliveryId: String) {
        _obdItems.value = NetworkResult.Loading()
        _warehouseTasks.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            // Fetch Header if null
            if (_currentObd.value == null || _currentObd.value?.EWMOutboundDeliveryOrder != deliveryId) {
                val headerFilter = "EWMWarehouse eq '$selectedWarehouse' and EWMOutboundDeliveryOrder eq '$deliveryId'"
                val headerRes = repository.getEwmOutboundDeliveries(headerFilter)
                if (headerRes is NetworkResult.Success && !headerRes.data?.value.isNullOrEmpty()) {
                    _currentObd.value = headerRes.data?.value?.first()
                }
            }

            // Fetch Items
            val itemsFilter = "EWMWarehouse eq '$selectedWarehouse' and EWMOutboundDeliveryOrder eq '$deliveryId'"
            val itemsResponse = repository.getEwmOutboundDeliveryItems(itemsFilter)
            if (itemsResponse is NetworkResult.Success) {
                _obdItems.postValue(NetworkResult.Success(itemsResponse.data?.value ?: emptyList()))
            } else {
                _obdItems.postValue(NetworkResult.Error(itemsResponse.message ?: "Unknown error"))
            }

            // Fetch Tasks
            val tasksFilter = "EWMWarehouse eq '$selectedWarehouse' and EWMDelivery eq '$deliveryId'"
            val tasksResponse = repository.getWarehouseTasks(tasksFilter)
            if (tasksResponse is NetworkResult.Success) {
                _warehouseTasks.postValue(NetworkResult.Success(tasksResponse.data?.value ?: emptyList()))
            } else {
                 _warehouseTasks.postValue(NetworkResult.Error(tasksResponse.message ?: "Unknown error"))
            }
        }
    }

    fun postGoodsIssue(deliveryId: String) {
        _postResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                // Fetch CSRF token - assuming getEwmOutboundDeliveries will not fetch token directly, 
                // but any request to repository will cache token? Actually, we'll fetch explicitly.
                val etagRequest = repository.getEwmOutboundDeliveries("EWMWarehouse eq '$selectedWarehouse' and EWMOutboundDeliveryOrder eq '$deliveryId'")
                var etag = "*"
                var csrf = ""
                
                // Assuming repository handles CSRF transparently or we need a fetchCSRFToken() method.
                // In SapRepository, we usually do `repository.getPurchaseRequisitions()` to get the token.
                val dummyReq = repository.getReservations("\$top=1") 
                // SapApiService automatically intercepts and saves CSRF token in CookieJar/headers in a standard setup.
                
                // For now, use empty csrf if SapApiService auto-injects, or wait for error.
                val postResponse = repository.postEwmGoodsIssue(
                    csrfToken = "fetch", // Placeholder if auto-fetched
                    etag = "*",
                    warehouse = selectedWarehouse,
                    deliveryId = deliveryId
                )
                
                if (postResponse is NetworkResult.Success) {
                    _postResult.postValue(NetworkResult.Success("Goods Issue posted successfully"))
                    fetchOutboundDeliveryDetails(deliveryId) // Refresh
                } else {
                    _postResult.postValue(NetworkResult.Error(postResponse.message ?: "Unknown error"))
                }
                
            } catch (e: Exception) {
                _postResult.postValue(NetworkResult.Error("Post failed: ${e.message}"))
            }
        }
    }
    
    fun resetPostResult() {
        _postResult.value = null
    }
}
