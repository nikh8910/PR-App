package com.prapp.warehouse.ui.purchaserequisition

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.PurchaseOrder
import com.prapp.warehouse.data.models.PurchaseOrderItem
import com.prapp.warehouse.data.models.PurchaseRequisition
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch

class PoFromPrViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = SapRepository(application)

    private val _creationResult = MutableLiveData<NetworkResult<String>>()
    val creationResult: LiveData<NetworkResult<String>> = _creationResult

    fun convertToPo(pr: PurchaseRequisition, supplierId: String) {
        viewModelScope.launch {
            _creationResult.value = NetworkResult.Loading()
            val token = repository.fetchCsrfToken()
            
            if (token != null) {
                // Map PR items to PO item format
                val poItems = pr._PurchaseRequisitionItem
                    ?.filter { (it.RequestedQuantity?.toFloatOrNull() ?: 0f) > 0f }
                    ?.mapIndexed { index, item ->
                        val itemNo = ((index + 1) * 10).toString().padStart(5, '0')
                        
                        PurchaseOrderItem(
                            purchaseOrder = "",
                            storageLocation = null,
                            purchaseOrderItem = itemNo,
                            plant = item.Plant ?: "1110",
                            orderQuantity = item.RequestedQuantity ?: "1",
                            unit = item.BaseUnit ?: "EA",
                            netPrice = item.PurchaseRequisitionPrice ?: "0.00",
                            documentCurrency = item.PurReqnItemCurrency ?: "EUR",
                            purchasingGroup = item.PurchasingGroup ?: "001",
                            purchaseRequisition = pr.PurchaseRequisition,
                            purchaseRequisitionItem = item.PurchaseRequisitionItem,
                            material = item.Material?.let { if (it.isNotBlank()) it.padStart(18, '0') else "" } ?: "",
                            itemText = if (item.Material.isNullOrBlank()) item.PurchaseRequisitionItemText ?: "Text Item" else "",
                            materialGroup = if (item.Material.isNullOrBlank()) item.MaterialGroup ?: "A001" else null
                        )
                    } ?: emptyList()

                if (poItems.isEmpty()) {
                    _creationResult.value = NetworkResult.Error("No valid items to convert.")
                    return@launch
                }

                // Build full payload
                val firstPrItem = pr._PurchaseRequisitionItem?.firstOrNull()
                val poPayload = PurchaseOrder(
                    companyCode = firstPrItem?.CompanyCode ?: "1110",
                    purchaseOrderType = "NB",
                    supplier = supplierId.padStart(10, '0'),
                    purchasingOrganization = "1110",
                    purchasingGroup = firstPrItem?.PurchasingGroup ?: "001",
                    documentCurrency = firstPrItem?.PurReqnItemCurrency ?: "EUR",
                    toPurchaseOrderItem = poItems
                )

                val result = repository.createPurchaseOrder(token, poPayload)
                if (result is NetworkResult.Success) {
                    val poNumber = result.data?.d?.purchaseOrder ?: "Unknown PO"
                    _creationResult.value = NetworkResult.Success(poNumber)
                } else {
                    _creationResult.value = NetworkResult.Error("PO Creation failed: ${result.message}")
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
