package com.prapp.warehouse.data.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.DELETE

interface SapApiService {
    @GET("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder?\$top=1")
    suspend fun validateCredentials(
        @Header("sap-client") client: String
    ): Response<Any>

    @GET("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder")
    suspend fun getPurchaseOrders(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 50,
        @Query("\$orderby") orderBy: String = "PurchaseOrder desc",
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PurchaseOrder>>

    @GET("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem")
    suspend fun getPurchaseOrderItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PurchaseOrderItem>>

    @POST("/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader")
    suspend fun postGoodsReceipt(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body body: com.prapp.warehouse.data.models.PostGRRequest
    ): Response<Any>
    
    @POST("/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader")
    suspend fun postStockMovement(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body body: com.prapp.warehouse.data.models.MoveStockRequest
    ): Response<Any>

    @GET("/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader?\$top=1")
    suspend fun fetchCsrfToken(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String = "Fetch"
    ): Response<Any>

    @GET("/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV;v=0002/A_InboundDeliveryHeader")
    suspend fun getInboundDeliveries(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 50,
        @Query("\$orderby") orderBy: String = "DeliveryDocument desc",
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.InboundDelivery>>

    @GET("/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV;v=0002/A_InboundDeliveryItem")
    suspend fun getInboundDeliveryItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.InboundDeliveryItem>>

    @GET("/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV;v=0002/A_InbDeliveryHeader('{deliveryId}')")
    suspend fun getInboundDeliveryHeader(
        @Header("sap-client") client: String,
        @Path("deliveryId") deliveryId: String
    ): Response<Any> // We only need headers (ETag)

    @POST("/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV;v=0002/PostGoodsReceipt")
    suspend fun postGoodsReceiptForIBD(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String,
        @Query("DeliveryDocument") deliveryDocument: String
    ): Response<Any>

    // --- Outbound Delivery / Goods Issue ---

    @GET("/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002/A_OutbDeliveryHeader")
    suspend fun getOutboundDeliveries(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 50,
        @Query("\$orderby") orderBy: String = "DeliveryDocument desc",
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.OutboundDelivery>>

    @GET("/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002/A_OutbDeliveryHeader('{deliveryId}')")
    suspend fun getOutboundDeliveryHeader(
        @Header("sap-client") client: String,
        @Path("deliveryId") deliveryId: String
    ): Response<Any> // Headers only (ETag)

    @GET("/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002/A_OutbDeliveryHeader('{deliveryId}')/to_DeliveryDocumentItem")
    suspend fun getOutboundDeliveryItems(
        @Header("sap-client") client: String,
        @Path("deliveryId") deliveryId: String
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.OutboundDeliveryItem>>

    @POST("/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002/PickOneItem")
    suspend fun pickOutboundDeliveryItem(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String?,
        @Query("DeliveryDocument") deliveryDocument: String,
        @Query("DeliveryDocumentItem") deliveryDocumentItem: String
    ): Response<Any>

    @POST("/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002/PostGoodsIssue")
    suspend fun postGoodsIssueForOD(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String?,
        @Query("DeliveryDocument") deliveryDocument: String
    ): Response<Any>

    // --- Physical Inventory ---

    @GET("/sap/opu/odata/sap/API_PHYSICAL_INVENTORY_DOC_SRV/A_PhysInventoryDocHeader")
    suspend fun getPhysicalInventoryDocs(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 50,
        @Query("\$orderby") orderBy: String = "PhysicalInventoryDocument desc",
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PhysicalInventoryDoc>>

    @GET("/sap/opu/odata/sap/API_PHYSICAL_INVENTORY_DOC_SRV/A_PhysInventoryDocItem")
    suspend fun getPhysicalInventoryItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PhysicalInventoryItem>>

    @GET("/sap/opu/odata/sap/API_PHYSICAL_INVENTORY_DOC_SRV/A_PhysInventoryDocItem(FiscalYear='{fiscalYear}',PhysicalInventoryDocument='{piDoc}',PhysicalInventoryDocumentItem='{piItem}')")
    suspend fun getPhysicalInventoryItem(
        @Header("sap-client") client: String,
        @Path("fiscalYear") fiscalYear: String,
        @Path("piDoc") piDoc: String,
        @Path("piItem") piItem: String
    ): Response<com.prapp.warehouse.data.models.PhysicalInventoryItem> // To fetch ETag

    @PATCH("/sap/opu/odata/sap/API_PHYSICAL_INVENTORY_DOC_SRV/A_PhysInventoryDocItem(FiscalYear='{fiscalYear}',PhysicalInventoryDocument='{piDoc}',PhysicalInventoryDocumentItem='{piItem}')")
    suspend fun updatePhysicalInventoryCount(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String,
        @Path("fiscalYear") fiscalYear: String,
        @Path("piDoc") piDoc: String,
        @Path("piItem") piItem: String,
        @Body body: com.prapp.warehouse.data.models.UpdatePIItemRequest
    ): Response<Any>
    
    // --- Stock Overview ---
    
    @GET("/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod")
    suspend fun getMaterialStock(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 50
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.MaterialStock>>

    // --- Phase 2: EWM & Stock Movements ---

    // Handling Units (OData V4)
    @GET("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnit")
    suspend fun getHandlingUnits(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String? = null,
        @Query("\$top") top: Int = 50
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.HandlingUnit>>

    @GET("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnit")
    suspend fun getHandlingUnitDetails(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$expand") expand: String = "_HandlingUnitItem",
        @Query("\$top") top: Int = 1
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.HandlingUnit>>

    @POST("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnit")
    suspend fun createHandlingUnit(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body body: Any // Replace with specific request model later if needed
    ): Response<com.prapp.warehouse.data.models.HandlingUnit>

    @DELETE("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnit(HandlingUnitExternalID='{huId}')")
    suspend fun deleteHandlingUnit(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String,
        @Path("huId") huId: String
    ): Response<Any>

    // Pack product into an HU — PATCH items on existing HU
    @PATCH("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnit(HandlingUnitExternalID='{huId}',EWMWarehouse='{warehouse}')")
    suspend fun packProductToHU(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Path("huId", encoded = true) huId: String,
        @Path("warehouse") warehouse: String,
        @Body body: Any
    ): Response<Any>

    // Repack (transfer) an HU item from one HU to another
    @POST("/sap/opu/odata4/sap/api_handlingunit/srvd_a2x/sap/handlingunit/0001/HandlingUnitItem(HandlingUnitExternalID='{huId}',EWMWarehouse='{warehouse}',StockItemUUID={stockUUID})/SAP__self.Repack")
    suspend fun repackHUItem(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Path("huId", encoded = true) huId: String,
        @Path("warehouse") warehouse: String,
        @Path("stockUUID") stockUUID: String,
        @Body body: Any
    ): Response<Any>


    @GET("/sap/opu/odata4/sap/api_warehouse_order_task_2/srvd_a2x/sap/warehouseorder/0001/WarehouseTask")
    suspend fun getWarehouseTasks(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String? = null,
        @Query("\$top") top: Int = 100
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.WarehouseTask>>

    @POST("/sap/opu/odata4/sap/api_warehouse_order_task_2/srvd_a2x/sap/warehouseorder/0001/WarehouseTask")
    suspend fun createWarehouseTask(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body body: Any // Replace with specific request model later
    ): Response<com.prapp.warehouse.data.models.WarehouseTask>
    
    @POST("/sap/opu/odata4/sap/api_warehouse_order_task_2/srvd_a2x/sap/warehouseorder/0001/WarehouseTask(EWMWarehouse='{warehouse}',WarehouseTask='{taskId}',WarehouseTaskItem='{taskItem}')/SAP__self.{actionName}")
    suspend fun confirmWarehouseTask(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String,
        @Path("warehouse") warehouse: String,
        @Path("taskId") taskId: String,
        @Path("taskItem") taskItem: String,
        @Path("actionName", encoded = true) actionName: String,
        @Body body: Any
    ): Response<Any>

    // --- EWM Value Helps (OData V4) ---
    @GET("/sap/opu/odata4/sap/api_warehouse_2/srvd_a2x/sap/warehouse/0001/WarehouseStorageType")
    suspend fun getWarehouseStorageTypes(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 100
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.WarehouseStorageType>>

    @GET("/sap/opu/odata4/sap/api_whse_storage_bin_2/srvd_a2x/sap/warehousestoragebin/0001/WarehouseStorageBin")
    suspend fun getWarehouseStorageBins(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 50
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.WarehouseStorageBin>>

    // --- EWM Physical Inventory (OData V4) ---
    @GET("/sap/opu/odata4/sap/api_whse_physinvtryitem_2/srvd_a2x/sap/whsephysicalinventorydoc/0001/WhsePhysicalInventoryItem")
    suspend fun getWhsePhysicalInventoryItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$expand") expand: String = "_WhsePhysicalInventoryCntItem",
        @Query("\$top") top: Int = 200
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.EwmPhysicalInventoryItem>>

    @POST("/sap/opu/odata4/sap/api_whse_physinvtryitem_2/srvd_a2x/sap/whsephysicalinventorydoc/0001/WhsePhysicalInventoryItem")
    suspend fun createWhsePhysicalInventoryDocument(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body payload: Any
    ): Response<com.prapp.warehouse.data.models.EwmPhysicalInventoryItem>

    // Using regular POST for batch operations. OData batch endpoint:
    @POST("/sap/opu/odata4/sap/api_whse_physinvtryitem_2/srvd_a2x/sap/whsephysicalinventorydoc/0001/\$batch")
    suspend fun postWhsePhysicalInventoryBatch(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("Content-Type") contentType: String,
        @Header("Accept") accept: String = "multipart/mixed",
        @Body body: okhttp3.RequestBody
    ): Response<okhttp3.ResponseBody>

    @POST("/sap/opu/odata4/sap/api_whse_physinvtryitem_2/srvd_a2x/sap/whsephysicalinventorydoc/0001/WhsePhysicalInventoryCountItem")
    suspend fun addWhsePhysicalInventoryCountItem(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body payload: Any
    ): Response<com.prapp.warehouse.data.models.EwmPhysicalInventoryCountItem>

    // Warehouse Physical Stock (OData V4)
    @GET("/sap/opu/odata4/sap/api_whse_physstockprod/srvd_a2x/sap/whsephysicalstockproducts/0001/WarehousePhysicalStockProducts")
    suspend fun getWarehousePhysicalStock(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 500
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.WarehouseStockItem>>

    // Warehouse Available Stock (OData V4)
    @GET("/sap/opu/odata4/sap/api_whse_availablestock/srvd_a2x/sap/warehouseavailablestock/0001/WarehouseAvailableStock")
    suspend fun getWarehouseAvailableStock(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 500
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.WarehouseStockItem>>

    // Reservations (GI Against Reservation) (OData V2)
    @GET("/sap/opu/odata/sap/API_RESERVATION_DOCUMENT_SRV/A_ReservationDocumentHeader")
    suspend fun getReservations(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 30,
        @Query("\$orderby") orderBy: String = "Reservation desc",
        @Query("\$expand") expand: String = "to_ReservationDocumentItem",
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.Reservation>>

    @GET("/sap/opu/odata/sap/API_RESERVATION_DOCUMENT_SRV/A_ReservationDocumentItem")
    suspend fun getReservationItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.ReservationItem>>

    // --- EWM Outbound Deliveries (OData V4) ---
    @GET("/sap/opu/odata4/sap/api_warehouse_odo_2/srvd_a2x/sap/warehouseoutbdeliveryorder/0001/WhseOutboundDeliveryOrderHead")
    suspend fun getEwmOutboundDeliveries(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String? = null,
        @Query("\$top") top: Int = 50
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.OutboundDeliveryHeader>>

    @GET("/sap/opu/odata4/sap/api_warehouse_odo_2/srvd_a2x/sap/warehouseoutbdeliveryorder/0001/WhseOutboundDeliveryOrderItem")
    suspend fun getEwmOutboundDeliveryItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String? = null
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.EwmOutboundDeliveryItem>>

    @POST("/sap/opu/odata4/sap/api_warehouse_odo_2/srvd_a2x/sap/warehouseoutbdeliveryorder/0001/WhseOutboundDeliveryOrderHead(EWMWarehouse='{warehouse}',EWMOutboundDeliveryOrder='{deliveryId}')/SAP__self.PostGoodsIssue")
    suspend fun postEwmGoodsIssue(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Header("If-Match") etag: String,
        @Path("warehouse") warehouse: String,
        @Path("deliveryId") deliveryId: String,
        @Body payload: Any = Any()
    ): Response<Any>

    // --- Purchase Requisitions (OData V4 via assumed standard path) ---
    @GET("/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn")
    suspend fun getPurchaseRequisitions(
        @Header("sap-client") client: String,
        @Query("\$top") top: Int = 10,
        @Query("\$orderby") orderBy: String = "PurchaseRequisition desc",
        @Query("\$expand") expand: String = "_PurchaseRequisitionItem"
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.PurchaseRequisition>>

    @GET("/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn")
    suspend fun searchPurchaseRequisitions(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$orderby") orderBy: String = "PurchaseRequisition desc",
        @Query("\$expand") expand: String = "_PurchaseRequisitionItem"
    ): Response<com.prapp.warehouse.data.models.ODataV4ListResponse<com.prapp.warehouse.data.models.PurchaseRequisition>>

    @GET("/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn('{prNumber}')")
    suspend fun getPurchaseRequisitionDetail(
        @Header("sap-client") client: String,
        @Path("prNumber") prNumber: String,
        @Query("\$expand") expand: String = "_PurchaseRequisitionItem"
    ): Response<com.prapp.warehouse.data.models.PurchaseRequisition>

    @POST("/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn")
    suspend fun createPurchaseRequisition(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body payload: com.prapp.warehouse.data.models.PurchaseRequisition
    ): Response<com.prapp.warehouse.data.models.PurchaseRequisition>

    @POST("/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn('{prNumber}')/_PurchaseRequisitionItem")
    suspend fun addPurchaseRequisitionItem(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Path("prNumber") prNumber: String,
        @Body payload: com.prapp.warehouse.data.models.PurchaseRequisitionItem
    ): Response<com.prapp.warehouse.data.models.PurchaseRequisitionItem>

    // --- Purchase Orders (OData V2) ---
    @POST("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder")
    suspend fun createPurchaseOrder(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body payload: com.prapp.warehouse.data.models.PurchaseOrder
    ): Response<com.prapp.warehouse.data.models.ODataResponse<com.prapp.warehouse.data.models.PurchaseOrder>>

    // --- Reservations (OData V2) ---
    @GET("/sap/opu/odata/sap/API_RESERVATION_SRV/A_ReservationDocumentHeader")
    suspend fun getReservations(
        @Header("sap-client") client: String,
        @Query("\$expand") expand: String = "to_ReservationDocumentItem",
        @Query("\$filter") filter: String? = null,
        @Query("\$top") top: Int = 100
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.Reservation>>

    // --- Purchase Orders for STO (OData V2) ---
    @GET("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder")
    suspend fun getPurchaseOrders(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String? = null,
        @Query("\$top") top: Int = 100,
        @Query("\$orderby") orderBy: String = "PurchaseOrder desc"
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PurchaseOrder>>

    @GET("/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem")
    suspend fun getPurchaseOrderItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 100
    ): Response<com.prapp.warehouse.data.models.ODataListResponse<com.prapp.warehouse.data.models.PurchaseOrderItem>>

    // --- Material Documents (for in-transit detection) ---
    @GET("/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentItem")
    suspend fun getMaterialDocumentItems(
        @Header("sap-client") client: String,
        @Query("\$filter") filter: String,
        @Query("\$top") top: Int = 200
    ): Response<com.prapp.warehouse.data.models.MaterialDocumentItemListResponse>

    // --- Goods Movement Post (Reservation GI mvt 261, STO GI mvt 351) ---
    @POST("/sap/opu/odata/sap/API_GOODSMOVEMENT_SRV;v=0002/A_GoodsMovement")
    suspend fun postGoodsMovement(
        @Header("sap-client") client: String,
        @Header("x-csrf-token") csrfToken: String,
        @Body body: com.prapp.warehouse.data.models.GoodsMovementPostRequest
    ): Response<com.prapp.warehouse.data.models.GoodsMovementPostResponse>
}

