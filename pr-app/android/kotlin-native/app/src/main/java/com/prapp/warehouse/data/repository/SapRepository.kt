package com.prapp.warehouse.data.repository

import android.app.Application
import com.prapp.warehouse.data.api.SapApiService
import com.prapp.warehouse.data.api.ServiceGenerator
import com.prapp.warehouse.utils.SharedPrefsManager
import retrofit2.Response
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SapRepository(application: Application) {

    private val service: SapApiService
    private val client: String

    init {
        val prefs = SharedPrefsManager(application)
        client = prefs.getClient() ?: "100"
        service = ServiceGenerator.createService(application, SapApiService::class.java)
    }

    // --- Filter Builders ---

    /** OData V2 datetime literal: datetime'YYYY-MM-DDT00:00:00' */
    private fun oDataDate(dateStr: String, endOfDay: Boolean = false): String {
        val timePart = if (endOfDay) "T23:59:59" else "T00:00:00"
        return "datetime'${dateStr}${timePart}'"
    }

    fun buildPOFilter(poNumber: String?, supplier: String?, dateFrom: String?, dateTo: String?): String? {
        if (!poNumber.isNullOrBlank()) {
            // PO number takes priority — sole filter
            return "PurchaseOrder eq '${poNumber.trim()}'"
        }
        val parts = mutableListOf<String>()
        if (!supplier.isNullOrBlank()) parts.add("Supplier eq '${supplier.trim().uppercase()}'")
        if (!dateFrom.isNullOrBlank()) parts.add("PurchaseOrderDate ge ${oDataDate(dateFrom)}")
        if (!dateTo.isNullOrBlank()) parts.add("PurchaseOrderDate le ${oDataDate(dateTo, endOfDay = true)}")
        return if (parts.isEmpty()) null else parts.joinToString(" and ")
    }

    fun buildIBDFilter(deliveryNumber: String?, supplier: String?, dateFrom: String?, dateTo: String?): String {
        if (!deliveryNumber.isNullOrBlank()) {
            return "DeliveryDocument eq '${deliveryNumber.trim()}'"
        }
        val parts = mutableListOf("OverallGoodsMovementStatus ne 'C'")
        if (!supplier.isNullOrBlank()) parts.add("Supplier eq '${supplier.trim().uppercase()}'")
        if (!dateFrom.isNullOrBlank()) parts.add("PlannedDeliveryDate ge ${oDataDate(dateFrom)}")
        if (!dateTo.isNullOrBlank()) parts.add("PlannedDeliveryDate le ${oDataDate(dateTo, endOfDay = true)}")
        return parts.joinToString(" and ")
    }

    fun buildODFilter(deliveryNumber: String?, shippingPoint: String?, dateFrom: String?, dateTo: String?): String {
        if (!deliveryNumber.isNullOrBlank()) {
            return "DeliveryDocument eq '${deliveryNumber.trim()}'"
        }
        val parts = mutableListOf("OverallGoodsMovementStatus ne 'C'")
        if (!shippingPoint.isNullOrBlank()) parts.add("ShippingPoint eq '${shippingPoint.trim().uppercase()}'")
        if (!dateFrom.isNullOrBlank()) parts.add("PlannedGoodsIssueDate ge ${oDataDate(dateFrom)}")
        if (!dateTo.isNullOrBlank()) parts.add("PlannedGoodsIssueDate le ${oDataDate(dateTo, endOfDay = true)}")
        return parts.joinToString(" and ")
    }

    fun buildPIFilter(piDocNumber: String?, plant: String?, storageLocation: String?): String? {
        if (!piDocNumber.isNullOrBlank()) {
            return "PhysicalInventoryDocument eq '${piDocNumber.trim()}'"
        }
        val parts = mutableListOf("PhysicalInventoryCountStatus ne 'C'")
        if (!plant.isNullOrBlank()) parts.add("Plant eq '${plant.trim().uppercase()}'")
        if (!storageLocation.isNullOrBlank()) parts.add("StorageLocation eq '${storageLocation.trim().uppercase()}'")
        return parts.joinToString(" and ")
    }

    fun buildStockFilter(material: String, plant: String, storageLocation: String): String {
        val parts = mutableListOf<String>()
        if (material.isNotBlank()) parts.add("substringof('${material.trim()}', Material)")
        if (plant.isNotBlank()) parts.add("Plant eq '${plant.trim().uppercase()}'")
        if (storageLocation.isNotBlank()) parts.add("StorageLocation eq '${storageLocation.trim().uppercase()}'")
        return parts.joinToString(" and ")
    }

    // --- Helper Methods ---
    
    suspend fun fetchCsrfToken(): String? {
        return try {
            val response = service.fetchCsrfToken(client)
            if (response.isSuccessful) {
                response.headers()["x-csrf-token"]
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    // --- Goods Receipt (PO) ---
    
    suspend fun getPurchaseOrders(filter: String? = null, top: Int = 100) = safeApiCall {
        service.getPurchaseOrders(client, filter, top)
    }
    
    suspend fun getPurchaseOrderItems(poNumber: String) = safeApiCall { 
        service.getPurchaseOrderItems(client, "PurchaseOrder eq '$poNumber'") 
    }
    
    suspend fun postGoodsReceipt(csrfToken: String, payload: com.prapp.warehouse.data.models.PostGRRequest) =
        safeApiCall { service.postGoodsReceipt(client, csrfToken, payload) }

    suspend fun postStockMovement(csrfToken: String, payload: com.prapp.warehouse.data.models.MoveStockRequest) =
        safeApiCall { service.postStockMovement(client, csrfToken, payload) }

    // --- Inbound Delivery (IBD) ---
    
    suspend fun getInboundDeliveries(filter: String? = null) = safeApiCall {
        service.getInboundDeliveries(client, filter = filter)
    }
    
    suspend fun getInboundDeliveryItems(deliveryId: String) = safeApiCall { 
        service.getInboundDeliveryItems(client, "DeliveryDocument eq '$deliveryId'") 
    }
    
    suspend fun getInboundDeliveryHeader(deliveryId: String) = safeApiCall {
        service.getInboundDeliveryHeader(client, deliveryId)
    }
    
    suspend fun postGoodsReceiptForIBD(csrfToken: String, etag: String, deliveryId: String) =
        safeApiCall { service.postGoodsReceiptForIBD(client, csrfToken, etag, deliveryId) }

    // --- Goods Issue (OD) ---

    suspend fun getOutboundDeliveries(filter: String? = null) = safeApiCall {
        service.getOutboundDeliveries(client, filter = filter)
    }
    
    suspend fun getOutboundDeliveryItems(deliveryId: String) = safeApiCall { 
        service.getOutboundDeliveryItems(client, deliveryId) 
    }
    
    suspend fun getOutboundDeliveryHeader(deliveryId: String) = safeApiCall {
        service.getOutboundDeliveryHeader(client, deliveryId)
    }
    
    suspend fun pickOutboundDeliveryItem(csrfToken: String, etag: String?, deliveryId: String, itemId: String) =
        safeApiCall { service.pickOutboundDeliveryItem(client, csrfToken, etag, "'$deliveryId'", "'$itemId'") }
        
    suspend fun postGoodsIssueForOD(csrfToken: String, etag: String?, deliveryId: String) =
        safeApiCall { service.postGoodsIssueForOD(client, csrfToken, etag, "'$deliveryId'") }

    // --- Physical Inventory ---

    suspend fun getPhysicalInventoryDocs(filter: String? = null) = safeApiCall {
        service.getPhysicalInventoryDocs(client, filter = filter)
    }
    
    suspend fun getPhysicalInventoryItems(piDoc: String, fiscalYear: String) = safeApiCall {
        service.getPhysicalInventoryItems(client, "PhysicalInventoryDocument eq '$piDoc' and FiscalYear eq '$fiscalYear'")
    }
    
    suspend fun getPhysicalInventoryItem(piDoc: String, fiscalYear: String, piItem: String) = safeApiCall {
        service.getPhysicalInventoryItem(client, fiscalYear, piDoc, piItem)
    }
    
    suspend fun updatePhysicalInventoryCount(
        csrfToken: String, 
        etag: String, 
        piDoc: String, 
        fiscalYear: String, 
        piItem: String, 
        payload: com.prapp.warehouse.data.models.UpdatePIItemRequest
    ) = safeApiCall { 
        service.updatePhysicalInventoryCount(client, csrfToken, etag, fiscalYear, piDoc, piItem, payload) 
    }

    // --- EWM Physical Inventory ---

    suspend fun getWhsePhysicalInventoryItems(filter: String) = safeApiCall {
        service.getWhsePhysicalInventoryItems(client, filter)
    }

    suspend fun createWhsePhysicalInventoryDocument(csrfToken: String, payload: Any) = safeApiCall {
        service.createWhsePhysicalInventoryDocument(client, csrfToken, payload)
    }

    suspend fun postWhsePhysicalInventoryBatch(
        csrfToken: String,
        body: okhttp3.RequestBody
    ) = safeApiCall {
        service.postWhsePhysicalInventoryBatch(client, csrfToken, "multipart/mixed; boundary=batch", body = body)
    }

    suspend fun addWhsePhysicalInventoryCountItem(csrfToken: String, payload: Any) = safeApiCall {
        service.addWhsePhysicalInventoryCountItem(client, csrfToken, payload)
    }

    // --- EWM Value Helps ---

    suspend fun getWarehouseStorageTypes(filter: String) = safeApiCall {
        service.getWarehouseStorageTypes(client, filter)
    }

    suspend fun getWarehouseStorageBins(filter: String) = safeApiCall {
        service.getWarehouseStorageBins(client, filter)
    }

    // --- Stock Overview ---

    // --- Stock Overview ---

    suspend fun getMaterialStock(filter: String) = safeApiCall {
        service.getMaterialStock(client, filter)
    }

    // --- Phase 2: EWM & Stock Movements ---

    suspend fun getHandlingUnits(filter: String? = null) = safeApiCall {
        service.getHandlingUnits(client, filter)
    }

    suspend fun getHandlingUnitDetails(huExternalId: String) = safeApiCall {
        service.getHandlingUnitDetails(client, "HandlingUnitExternalID eq '$huExternalId'")
    }

    suspend fun createHandlingUnit(csrfToken: String, payload: Any) = safeApiCall {
        service.createHandlingUnit(client, csrfToken, payload)
    }

    suspend fun deleteHandlingUnit(csrfToken: String, etag: String, huExternalId: String) = safeApiCall {
        service.deleteHandlingUnit(client, csrfToken, etag, huExternalId)
    }

    suspend fun packProductToHU(csrfToken: String, huId: String, warehouse: String, payload: Any) = safeApiCall {
        service.packProductToHU(client, csrfToken, huId, warehouse, payload)
    }

    suspend fun repackHUItem(csrfToken: String, huId: String, warehouse: String, stockUUID: String, payload: Any) = safeApiCall {
        service.repackHUItem(client, csrfToken, huId, warehouse, stockUUID, payload)
    }

    suspend fun getWarehouseTasks(filter: String? = null) = safeApiCall {
        service.getWarehouseTasks(client, filter)
    }

    suspend fun createWarehouseTask(csrfToken: String, payload: Any) = safeApiCall {
        service.createWarehouseTask(client, csrfToken, payload)
    }

    suspend fun confirmWarehouseTask(
        csrfToken: String, 
        etag: String, 
        warehouse: String, 
        taskId: String, 
        taskItem: String, 
        actionName: String, 
        payload: Any
    ) = safeApiCall {
        service.confirmWarehouseTask(client, csrfToken, etag, warehouse, taskId, taskItem, actionName, payload)
    }

    suspend fun getWarehousePhysicalStock(filter: String) = safeApiCall {
        service.getWarehousePhysicalStock(client, filter)
    }

    suspend fun getWarehouseAvailableStock(filter: String) = safeApiCall {
        service.getWarehouseAvailableStock(client, filter)
    }

    suspend fun getReservations(filter: String? = null) = safeApiCall {
        service.getReservations(client, filter = filter)
    }

    suspend fun getReservationItems(reservation: String) = safeApiCall {
        service.getReservationItems(client, "Reservation eq '$reservation'")
    }

    // --- Util ---
    
    // --- Purchase Requisitions (PR) ---

    fun buildPRFilter(prNumber: String?): String? {
        if (!prNumber.isNullOrBlank()) {
            return "contains(PurchaseRequisition,'${prNumber.trim()}')"
        }
        return null
    }

    suspend fun getPurchaseRequisitions(filter: String? = null) = safeApiCall {
        if (filter.isNullOrBlank()) {
            service.getPurchaseRequisitions(client)
        } else {
            service.searchPurchaseRequisitions(client, filter = filter)
        }
    }

    suspend fun getPurchaseRequisitionDetail(prNumber: String) = safeApiCall {
        service.getPurchaseRequisitionDetail(client, prNumber)
    }

    suspend fun createPurchaseRequisition(csrfToken: String, payload: com.prapp.warehouse.data.models.PurchaseRequisition) = safeApiCall {
        service.createPurchaseRequisition(client, csrfToken, payload)
    }

    suspend fun addPurchaseRequisitionItem(csrfToken: String, prNumber: String, payload: com.prapp.warehouse.data.models.PurchaseRequisitionItem) = safeApiCall {
        service.addPurchaseRequisitionItem(client, csrfToken, prNumber, payload)
    }

    suspend fun createPurchaseOrder(csrfToken: String, payload: com.prapp.warehouse.data.models.PurchaseOrder) = safeApiCall {
        service.createPurchaseOrder(client, csrfToken, payload)
    }

    // --- EWM Outbound Deliveries ---
    suspend fun getEwmOutboundDeliveries(filter: String? = null) = safeApiCall {
        service.getEwmOutboundDeliveries(client, filter)
    }

    suspend fun getEwmOutboundDeliveryItems(filter: String? = null) = safeApiCall {
        service.getEwmOutboundDeliveryItems(client, filter)
    }

    suspend fun postEwmGoodsIssue(csrfToken: String, etag: String, warehouse: String, deliveryId: String, payload: Any = Any()) = safeApiCall {
        service.postEwmGoodsIssue(client, csrfToken, etag, warehouse, deliveryId, payload)
    }

    private suspend fun <T> safeApiCall(apiCall: suspend () -> Response<T>): com.prapp.warehouse.utils.NetworkResult<T> {
        return try {
            val response = apiCall()
            if (response.isSuccessful) {
                val body = response.body()
                if (body == null && response.code() == 204) {
                     com.prapp.warehouse.utils.NetworkResult.Success(body as T)
                } else if (body != null) {
                    com.prapp.warehouse.utils.NetworkResult.Success(body)
                } else {
                     com.prapp.warehouse.utils.NetworkResult.Error("Empty response body")
                }
            } else {
                // Try to extract SAP error message from body
                val errorBody = try { response.errorBody()?.string() } catch (e: Exception) { null }
                val message = parseSapError(response.code(), errorBody) ?: "Failed: ${response.code()} ${response.message()}"
                com.prapp.warehouse.utils.NetworkResult.Error(message)
            }
        } catch (e: Exception) {
            com.prapp.warehouse.utils.NetworkResult.Error("Error: ${e.message}")
        }
    }

    private fun parseSapError(code: Int, body: String?): String? {
        if (body.isNullOrBlank()) return null
        return try {
            // Try JSON: {"error":{"message":{"value":"..."}}}
            val errIdx = body.indexOf("\"error\"")
            val msgValIdx = body.indexOf("\"value\"", errIdx)
            if (msgValIdx > 0) {
                val start = body.indexOf('"', msgValIdx + 8)
                val end = body.indexOf('"', start + 1)
                if (start > 0 && end > start) return body.substring(start + 1, end)
            }
            null
        } catch (e: Exception) {
            null
        }
    }
    // --- GI: Material Documents (in-transit detection for STO) ---
    suspend fun getMaterialDocumentItems(purchaseOrder: String, movementType: String? = null): com.prapp.warehouse.utils.NetworkResult<com.prapp.warehouse.data.models.MaterialDocumentItemListResponse> {
        var filter = "PurchaseOrder eq '$purchaseOrder'"
        if (!movementType.isNullOrBlank()) filter += " and GoodsMovementType eq '$movementType'"
        return safeApiCall { service.getMaterialDocumentItems(client, filter) }
    }

    // --- GI: Goods Movement POST ---
    suspend fun postGoodsMovement(csrfToken: String, payload: com.prapp.warehouse.data.models.GoodsMovementPostRequest) = safeApiCall {
        service.postGoodsMovement(client, csrfToken, payload)
    }
}

