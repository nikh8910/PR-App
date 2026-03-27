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

class HandlingUnitDetailViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)
    
    private val _huDetail = MutableLiveData<NetworkResult<List<HandlingUnit>>>()
    val huDetail: LiveData<NetworkResult<List<HandlingUnit>>> = _huDetail

    private val _deleteResult = MutableLiveData<NetworkResult<String>>()
    val deleteResult: LiveData<NetworkResult<String>> = _deleteResult

    fun fetchDetails(huId: String) {
        _huDetail.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getHandlingUnitDetails(huId)
            if (result is NetworkResult.Success) {
                _huDetail.value = NetworkResult.Success(result.data?.value ?: emptyList())
            } else {
                _huDetail.value = NetworkResult.Error(result.message ?: "Failed to fetch HU details")
            }
        }
    }

    fun deleteHandlingUnit(huId: String) {
        _deleteResult.value = NetworkResult.Loading()
        viewModelScope.launch {
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _deleteResult.value = NetworkResult.Error("Failed to fetch CSRF Token")
                return@launch
            }
            // Passing "*" to bypass exact ETag matching for deletion if not strictly enforced, 
            // otherwise we would need to capture it from the fetch operation headers.
            val result = repository.deleteHandlingUnit(csrfToken, "*", huId)
            if (result is NetworkResult.Success) {
                _deleteResult.value = NetworkResult.Success("Handling unit deleted successfully")
            } else {
                _deleteResult.value = NetworkResult.Error(result.message ?: "Failed to delete HU")
            }
        }
    }
}
