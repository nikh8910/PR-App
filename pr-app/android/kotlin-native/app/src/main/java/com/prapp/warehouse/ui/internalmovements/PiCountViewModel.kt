package com.prapp.warehouse.ui.internalmovements

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem
import com.prapp.warehouse.data.models.EwmPhysicalInventoryCountItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID

class PiCountViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    private val _piItems = MutableLiveData<NetworkResult<List<EwmPhysicalInventoryItem>>>()
    val piItems: LiveData<NetworkResult<List<EwmPhysicalInventoryItem>>> = _piItems

    private val _postResult = MutableLiveData<NetworkResult<String>>()
    val postResult: LiveData<NetworkResult<String>> = _postResult

    fun fetchPiItems(warehouse: String, binId: String) {
        _piItems.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                var filter = "EWMWarehouse eq '$warehouse' and PhysicalInventoryStatusText ne 'CTDN'"
                if (binId.isNotBlank()) {
                    filter += " and EWMStorageBin eq '$binId'"
                }
                
                val response = repository.getWhsePhysicalInventoryItems(filter)
                if (response is NetworkResult.Success) {
                    _piItems.value = NetworkResult.Success(response.data?.value ?: emptyList())
                } else {
                    _piItems.value = NetworkResult.Error(response.message ?: "Failed to fetch PI items")
                }
            } catch (e: Exception) {
                _piItems.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }

    fun postCount(
        headerItem: EwmPhysicalInventoryItem,
        countItem: EwmPhysicalInventoryCountItem,
        quantity: Double,
        exceptionCode: String
    ) {
        _postResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                val token = repository.fetchCsrfToken() ?: "fetch"
                
                val hasException = exceptionCode.isNotBlank()
                val qtyToPost = if (hasException) 0.0 else quantity

                // We need to send a $batch request with two PUT operations.
                val gson = Gson()
                val crlf = "\r\n"
                val boundary = "changeset"
                val batchBoundary = "batch"

                // Construct count item payload
                val ciPayload = JsonObject().apply {
                    addProperty("RequestedQuantity", qtyToPost)
                    if (hasException) {
                        addProperty("EWMPhysInvtryDifferenceReason", exceptionCode)
                    }
                }

                val ciKeyStr = "EWMWarehouse='${countItem.EWMWarehouse}',PhysicalInventoryDocNumber='${countItem.PhysicalInventoryDocNumber}',PhysicalInventoryDocYear='${countItem.PhysicalInventoryDocYear}',PhysicalInventoryItemNumber='${countItem.PhysicalInventoryItemNumber}',LineIndexOfPInvItem=${countItem.LineIndexOfPInvItem},PInvQuantitySequence=${countItem.PInvQuantitySequence}"

                // Construct header item payload
                val hiPayload = JsonObject().apply {
                    addProperty("PhysicalInventoryStatusText", "CTDN")
                }

                val hiKeyStr = "EWMWarehouse='${headerItem.EWMWarehouse}',PhysicalInventoryDocNumber='${headerItem.PhysicalInventoryDocNumber}',PhysicalInventoryDocYear='${headerItem.PhysicalInventoryDocYear}',PhysicalInventoryItemNumber='${headerItem.PhysicalInventoryItemNumber}'"

                val sb = StringBuilder()
                sb.append("--batch_$batchBoundary$crlf")
                sb.append("Content-Type: multipart/mixed; boundary=$boundary$crlf$crlf")

                // PUT Count Item
                sb.append("--$boundary$crlf")
                sb.append("Content-Type: application/http$crlf")
                sb.append("Content-Transfer-Encoding: binary$crlf")
                sb.append("Content-ID: 1$crlf$crlf")
                sb.append("PUT WhsePhysicalInventoryCountItem($ciKeyStr) HTTP/1.1$crlf")
                sb.append("Content-Type: application/json$crlf$crlf")
                sb.append(gson.toJson(ciPayload)).append("$crlf")

                // PUT Header Item
                sb.append("--$boundary$crlf")
                sb.append("Content-Type: application/http$crlf")
                sb.append("Content-Transfer-Encoding: binary$crlf")
                sb.append("Content-ID: 2$crlf$crlf")
                sb.append("PUT WhsePhysicalInventoryItem($hiKeyStr) HTTP/1.1$crlf")
                sb.append("Content-Type: application/json$crlf$crlf")
                sb.append(gson.toJson(hiPayload)).append("$crlf")

                sb.append("--$boundary--$crlf")
                sb.append("--batch_$batchBoundary--$crlf")

                val requestBody = sb.toString().toRequestBody("multipart/mixed; boundary=batch_$batchBoundary".toMediaTypeOrNull())

                val response = repository.postWhsePhysicalInventoryBatch(token, requestBody)
                
                if (response is NetworkResult.Success) {
                    val respText = response.data?.string() ?: ""
                    if (respText.contains("\"error\"") || respText.contains("HTTP/1.1 4")) {
                        _postResult.value = NetworkResult.Error("Batch request contained errors")
                    } else {
                        _postResult.value = NetworkResult.Success("Count posted successfully")
                    }
                } else {
                    _postResult.value = NetworkResult.Error(response.message ?: "Failed to post PI count")
                }
            } catch (e: Exception) {
                _postResult.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
