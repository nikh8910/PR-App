package com.prapp.warehouse.ui.internalmovements

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.prapp.warehouse.data.models.EwmPhysicalInventoryItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody

class PiAdhocCreateViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = SapRepository(application)

    private val _createResult = MutableLiveData<NetworkResult<String>>()
    val createResult: LiveData<NetworkResult<String>> = _createResult

    fun createPiDocument(items: List<EwmPhysicalInventoryItem>) {
        if (items.isEmpty()) {
            _createResult.value = NetworkResult.Error("No items to create")
            return
        }

        _createResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            try {
                val token = repository.fetchCsrfToken() ?: "fetch"

                if (items.size == 1) {
                    // Single item -> Direct POST
                    val response = repository.createWhsePhysicalInventoryDocument(token, items[0])
                    if (response is NetworkResult.Success) {
                        val docNum = response.data?.PhysicalInventoryDocNumber ?: "Unknown"
                        _createResult.value = NetworkResult.Success("PI Document $docNum created successfully!")
                    } else {
                        _createResult.value = NetworkResult.Error(response.message ?: "Failed to create PI Document")
                    }
                } else {
                    // Multiple items -> $batch request
                    val gson = Gson()
                    val crlf = "\r\n"
                    val boundary = "changeset"
                    val batchBoundary = "batch"
                    
                    val sb = StringBuilder()
                    sb.append("--batch_$batchBoundary$crlf")
                    sb.append("Content-Type: multipart/mixed; boundary=$boundary$crlf$crlf")

                    items.forEachIndexed { index, item ->
                        sb.append("--$boundary$crlf")
                        sb.append("Content-Type: application/http$crlf")
                        sb.append("Content-Transfer-Encoding: binary$crlf")
                        sb.append("Content-ID: ${index + 1}$crlf$crlf")
                        sb.append("POST WhsePhysicalInventoryItem HTTP/1.1$crlf")
                        sb.append("Content-Type: application/json$crlf$crlf")
                        sb.append(gson.toJson(item)).append("$crlf")
                    }

                    sb.append("--$boundary--$crlf")
                    sb.append("--batch_$batchBoundary--$crlf")

                    val requestBody = sb.toString().toRequestBody("multipart/mixed; boundary=batch_$batchBoundary".toMediaTypeOrNull())

                    val response = repository.postWhsePhysicalInventoryBatch(token, requestBody)
                    
                    if (response is NetworkResult.Success) {
                        val respText = response.data?.string() ?: ""
                        if (respText.contains("\"error\"") || respText.contains("HTTP/1.1 4")) {
                            _createResult.value = NetworkResult.Error("Batch request contained errors")
                        } else {
                            _createResult.value = NetworkResult.Success("PI Document created with ${items.size} item(s)!")
                        }
                    } else {
                        _createResult.value = NetworkResult.Error(response.message ?: "Failed to create PI Document batch")
                    }
                }
            } catch (e: Exception) {
                _createResult.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
