package com.prapp.warehouse.data.models

data class PostGRRequest(
    val d: PostGRData
)

data class PostGRData(
    val DocumentDate: String,
    val PostingDate: String,
    val GoodsMovementCode: String = "01",
    val DocumentHeaderText: String = "",
    val to_MaterialDocumentItem: List<PostGRItem>
)

data class PostGRItem(
    val Material: String,
    val Plant: String,
    val StorageLocation: String?,
    val PurchaseOrder: String,
    val PurchaseOrderItem: String,
    val GoodsMovementType: String = "101",
    val QuantityInEntryUnit: String,
    val EntryUnit: String
)
