package com.prapp.warehouse.ui.purchaserequisition

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.PurchaseRequisition
import com.prapp.warehouse.data.models.PurchaseRequisitionItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PrCreateViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)

    private val _creationResult = MutableLiveData<NetworkResult<Any>>()
    val creationResult: LiveData<NetworkResult<Any>> = _creationResult

    fun createPR(payload: PurchaseRequisition) {
        viewModelScope.launch {
            _creationResult.value = NetworkResult.Loading()
            val token = repository.fetchCsrfToken()
            if (token != null) {
                val result = repository.createPurchaseRequisition(token, payload)
                if (result is NetworkResult.Success) {
                    _creationResult.value = NetworkResult.Success(result.data as Any)
                } else {
                    _creationResult.value = NetworkResult.Error("Failed to create PR: ${result.message}")
                }
            } else {
                _creationResult.value = NetworkResult.Error("Failed to fetch CSRF token")
            }
        }
    }

    fun addItemToPR(prNumber: String, payload: PurchaseRequisitionItem) {
        viewModelScope.launch {
            _creationResult.value = NetworkResult.Loading()
            val token = repository.fetchCsrfToken()
            if (token != null) {
                val result = repository.addPurchaseRequisitionItem(token, prNumber, payload)
                if (result is NetworkResult.Success) {
                    _creationResult.value = NetworkResult.Success(result.data as Any)
                } else {
                    _creationResult.value = NetworkResult.Error("Failed to add Item: ${result.message}")
                }
            } else {
                _creationResult.value = NetworkResult.Error("Failed to fetch CSRF token")
            }
        }
    }
    
    fun resetResult() {
        _creationResult.value = null
    }
}
