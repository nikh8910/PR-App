package com.prapp.warehouse.ui.goodsreceipt

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.models.PostGRData
import com.prapp.warehouse.data.models.PostGRItem
import com.prapp.warehouse.data.models.PostGRRequest
import com.prapp.warehouse.data.models.PurchaseOrder
import com.prapp.warehouse.data.models.PurchaseOrderItem
import com.prapp.warehouse.data.repository.SapRepository
import com.prapp.warehouse.utils.NetworkResult
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class GoodsReceiptViewModel(application: Application) : AndroidViewModel(application) {
    
    private val repository = SapRepository(application)

    // --- Filter State ---
    private val _filters = MutableLiveData(GRFilters())
    val filters: LiveData<GRFilters> = _filters

    fun updateFilter(poNumber: String? = null, supplier: String? = null,
                     dateFrom: String? = null, dateTo: String? = null) {
        val current = _filters.value ?: GRFilters()
        _filters.value = current.copy(
            poNumber = poNumber ?: current.poNumber,
            supplier = supplier ?: current.supplier,
            dateFrom = dateFrom ?: current.dateFrom,
            dateTo = dateTo ?: current.dateTo
        )
    }

    fun setFilters(f: GRFilters) { _filters.value = f }

    // --- Data State ---
    private val _poList = MutableLiveData<NetworkResult<List<PurchaseOrder>>>()
    val poList: LiveData<NetworkResult<List<PurchaseOrder>>> = _poList
    
    private val _poItems = MutableLiveData<NetworkResult<List<PurchaseOrderItem>>>()
    val poItems: LiveData<NetworkResult<List<PurchaseOrderItem>>> = _poItems
    
    private val _selectedPO = MutableLiveData<PurchaseOrder?>()
    val selectedPO: LiveData<PurchaseOrder?> = _selectedPO
    
    private val _postResult = MutableLiveData<NetworkResult<String>?>()
    val postResult: LiveData<NetworkResult<String>?> = _postResult

    // --- GR Options State ---
    private val _movementType = MutableLiveData("101")
    val movementType: LiveData<String> = _movementType

    private val _headerText = MutableLiveData("")
    val headerText: LiveData<String> = _headerText

    fun setMovementType(type: String) { _movementType.value = type }
    fun setHeaderText(text: String) { _headerText.value = text }

    // --- Fetch POs with filters ---
    fun fetchPurchaseOrders() {
        val f = _filters.value ?: GRFilters()
        val filter = repository.buildPOFilter(f.poNumber, f.supplier, f.dateFrom, f.dateTo)
        _poList.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getPurchaseOrders(filter = filter)
            if (result is NetworkResult.Success) {
                _poList.value = NetworkResult.Success(result.data!!.d.results)
            } else if (result is NetworkResult.Error) {
                _poList.value = NetworkResult.Error(result.message!!)
            }
        }
    }
    
    fun fetchPOItems(poNumber: String) {
        _poItems.value = NetworkResult.Loading()
        viewModelScope.launch {
            val result = repository.getPurchaseOrderItems(poNumber)
            if (result is NetworkResult.Success) {
                 val items = result.data!!.d.results
                 items.forEach {
                    // Pre-populate defaults from PO item data
                    it.grQuantity = it.orderQuantity
                    it.grStorageLocation = it.storageLocation ?: ""
                }
                _poItems.value = NetworkResult.Success(items)
            } else if (result is NetworkResult.Error) {
                 _poItems.value = NetworkResult.Error(result.message!!)
            }
        }
    }
    
    fun postGoodsReceipt(items: List<PurchaseOrderItem>) {
        _postResult.value = NetworkResult.Loading()
        
        viewModelScope.launch {
            val csrfToken = repository.fetchCsrfToken()
            if (csrfToken == null) {
                _postResult.value = NetworkResult.Error("Failed to fetch CSRF token")
                return@launch
            }
            
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            val currentDate = sdf.format(Date())
            val mvtType = _movementType.value ?: "101"
            val hdrText = _headerText.value ?: ""

            val validItems = items.filter {
                it.grQuantity.isNotEmpty() && (it.grQuantity.toDoubleOrNull() ?: 0.0) > 0
            }

            if (validItems.isEmpty()) {
                _postResult.value = NetworkResult.Error("No items with quantity > 0 to post.")
                return@launch
            }

            val missingSlocs = validItems.filter { it.grStorageLocation.isBlank() && it.storageLocation.isNullOrBlank() }
            if (missingSlocs.isNotEmpty()) {
                val ids = missingSlocs.joinToString(", ") { it.purchaseOrderItem }
                _postResult.value = NetworkResult.Error("Cannot post: Items $ids are missing a Storage Location.")
                return@launch
            }

            val postItems = validItems.map {
                PostGRItem(
                    Material = it.material,
                    Plant = it.plant,
                    StorageLocation = it.grStorageLocation.ifBlank { it.storageLocation },
                    PurchaseOrder = it.purchaseOrder,
                    PurchaseOrderItem = it.purchaseOrderItem,
                    QuantityInEntryUnit = it.grQuantity,
                    EntryUnit = it.unit,
                    GoodsMovementType = mvtType
                )
            }
            
            val payload = PostGRRequest(
                PostGRData(
                    DocumentDate = currentDate,
                    PostingDate = currentDate,
                    DocumentHeaderText = hdrText,
                    to_MaterialDocumentItem = postItems
                )
            )
            
            val result = repository.postGoodsReceipt(csrfToken, payload)
            if (result is NetworkResult.Success) {
                _postResult.value = NetworkResult.Success("Goods Receipt posted for ${validItems.size} item(s)!")
            } else if (result is NetworkResult.Error) {
                _postResult.value = NetworkResult.Error(result.message!!)
            }
        }
    }
    
    fun resetPostResult() {
        _postResult.value = null
    }

    fun selectPO(po: PurchaseOrder) {
        _selectedPO.value = po
    }

    data class GRFilters(
        val poNumber: String = "",
        val supplier: String = "",
        val dateFrom: String = "",
        val dateTo: String = ""
    )
}
