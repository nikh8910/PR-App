package com.prapp.warehouse.ui.stockoverview

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.MaterialStock
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class StockViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = com.prapp.warehouse.data.repository.SapRepository(application)

    private val _stockList = MutableLiveData<NetworkResult<List<MaterialStock>>>()
    val stockList: LiveData<NetworkResult<List<MaterialStock>>> = _stockList
    
    fun fetchStock(material: String, plant: String, sloc: String) {
        val filter = repository.buildStockFilter(material, plant, sloc)
        if (filter.isBlank()) {
            _stockList.value = NetworkResult.Error("Please provide at least one search criteria")
            return
        }

        _stockList.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            val result = repository.getMaterialStock(filter)
            if (result is NetworkResult.Success) {
                _stockList.value = NetworkResult.Success(result.data?.d?.results ?: emptyList())
            } else {
                _stockList.value = NetworkResult.Error(result.message ?: "Unknown error occurred")
            }
        }
    }
}
