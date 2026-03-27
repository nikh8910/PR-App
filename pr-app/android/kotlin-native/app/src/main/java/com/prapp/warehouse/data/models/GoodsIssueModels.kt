package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

// Note: Reservation and ReservationItem already exist in Reservation.kt
// This file provides the additional models needed for the GI Reservation and GI STO flows.

// === Reservation List Response (OData V2) ===

data class ODataReservationListD(
    @SerializedName("results") val results: List<Reservation>? = null
)

data class ODataReservationListResponse(
    @SerializedName("d") val d: ODataReservationListD? = null,
    @SerializedName("value") val value: List<Reservation>? = null
)

// === STO Item — self-contained wrapper for PO item with runtime GI state ===

data class StoItem(
    val purchaseOrderItem: String = "",
    val material: String = "",
    val itemText: String = "",
    val plant: String = "",
    val storageLocation: String? = null,
    val orderQuantity: Double = 0.0,
    val goodsReceiptQuantity: Double = 0.0,
    val unit: String = "EA",
    var issueQty: Double? = null,
    var editedStorageLoc: String? = null,
    var editedPlant: String? = null,
    var alreadyIssuedQty: Double = 0.0,
    var giPosted: Boolean = false,
    var matDoc: String? = null
) {
    val remainingQty: Double
        get() = maxOf(0.0, (orderQuantity - goodsReceiptQuantity) - alreadyIssuedQty)
}

// === Goods Movement Post ===

data class GoodsMovementPostRequest(
    @SerializedName("GoodsMovementCode") val goodsMovementCode: String = "04",
    @SerializedName("DocumentDate") val documentDate: String,
    @SerializedName("PostingDate") val postingDate: String,
    @SerializedName("to_GoodsMovementItem") val toGoodsMovementItem: GoodsMovementItemList
)

data class GoodsMovementItemList(
    @SerializedName("results") val results: List<GoodsMovementItem>
)

data class GoodsMovementItem(
    @SerializedName("Material") val material: String,
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String,
    @SerializedName("QuantityInEntryUnit") val quantityInEntryUnit: String,
    @SerializedName("EntryUnit") val entryUnit: String,
    @SerializedName("GoodsMovementType") val goodsMovementType: String,
    @SerializedName("Reservation") val reservation: String? = null,
    @SerializedName("ReservationItem") val reservationItem: String? = null,
    @SerializedName("PurchaseOrder") val purchaseOrder: String? = null,
    @SerializedName("PurchaseOrderItem") val purchaseOrderItem: String? = null
)

data class GoodsMovementResponseResult(
    @SerializedName("MaterialDocument") val materialDocument: String? = null
)

data class GoodsMovementResponseD(
    @SerializedName("MaterialDocument") val materialDocument: String? = null,
    @SerializedName("PostGoodsMovement") val postGoodsMovement: GoodsMovementResponseResult? = null
)

data class GoodsMovementPostResponse(
    @SerializedName("d") val d: GoodsMovementResponseD? = null,
    @SerializedName("MaterialDocument") val materialDocument: String? = null
)

// === Material Document Item (for in-transit detection) ===

data class MaterialDocumentItemListD(
    @SerializedName("results") val results: List<MaterialDocumentItem>? = null
)

data class MaterialDocumentItemListResponse(
    @SerializedName("d") val d: MaterialDocumentItemListD? = null,
    @SerializedName("value") val value: List<MaterialDocumentItem>? = null
)

data class MaterialDocumentItem(
    @SerializedName("MaterialDocument") val materialDocument: String? = null,
    @SerializedName("PurchaseOrder") val purchaseOrder: String? = null,
    @SerializedName("PurchaseOrderItem") val purchaseOrderItem: String? = null,
    @SerializedName("QuantityInEntryUnit") val quantityInEntryUnit: String? = null,
    @SerializedName("GoodsMovementType") val goodsMovementType: String? = null
)
