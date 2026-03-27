package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class Reservation(
    @SerializedName("Reservation")
    val reservation: String = "",
    
    @SerializedName("ReservationDate")
    val reservationDate: String? = null,
    
    @SerializedName("to_ReservationDocumentItem")
    val items: ODataListResponse<ReservationItem>? = null
)

data class ReservationItem(
    @SerializedName("Reservation")
    val reservation: String = "",
    
    @SerializedName("ReservationItem")
    val reservationItem: String = "",
    
    @SerializedName("Material")
    val material: String? = null,
    
    @SerializedName("Plant")
    val plant: String? = null,
    
    @SerializedName("StorageLocation")
    val storageLocation: String? = null,
    
    @SerializedName("RequirementQuantity")
    val requirementQuantity: String? = null,
    
    @SerializedName("BaseUnit")
    val baseUnit: String? = null,
    
    @SerializedName("GoodsMovementType")
    val goodsMovementType: String? = null,
    
    @SerializedName("ReservationIsFinallyIssued")
    val reservationIsFinallyIssued: Boolean? = null
)
