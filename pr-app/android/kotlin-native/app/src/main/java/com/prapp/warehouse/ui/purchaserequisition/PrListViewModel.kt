package com.prapp.warehouse.ui.purchaserequisition

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.PurchaseRequisition
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PrListViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)

    private val _prs = MutableLiveData<NetworkResult<List<PurchaseRequisition>>>()
    val prs: LiveData<NetworkResult<List<PurchaseRequisition>>> = _prs

    fun fetchPRs(prNumber: String? = null) {
        viewModelScope.launch {
            _prs.value = NetworkResult.Loading()
            val filter = repository.buildPRFilter(prNumber)
            val result = repository.getPurchaseRequisitions(filter)
            if (result is NetworkResult.Success) {
                // Return value list
                _prs.value = NetworkResult.Success(result.data?.value ?: emptyList())
            } else if (result is NetworkResult.Error) {
                _prs.value = NetworkResult.Error(result.message ?: "Unknown error")
            }
        }
    }
}
