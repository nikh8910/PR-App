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

class PrDetailViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)

    private val _prDetail = MutableLiveData<NetworkResult<PurchaseRequisition>>()
    val prDetail: LiveData<NetworkResult<PurchaseRequisition>> = _prDetail

    fun fetchPrDetail(prNumber: String) {
        viewModelScope.launch {
            _prDetail.value = NetworkResult.Loading()
            val result = repository.getPurchaseRequisitionDetail(prNumber)
            _prDetail.value = result
        }
    }
}
