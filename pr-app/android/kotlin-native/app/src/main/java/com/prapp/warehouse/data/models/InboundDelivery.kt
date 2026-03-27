package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class InboundDelivery(
    @SerializedName("DeliveryDocument") val deliveryDocument: String,
    @SerializedName("DeliveryDate") val deliveryDate: String?,
    @SerializedName("OverallGoodsMovementStatus") val overallStatus: String?, // "A"=Not processed, "B"=Partially, "C"=Completed
    @SerializedName("Supplier") val supplier: String?,
    @SerializedName("PlannedDeliveryDate") val plannedDeliveryDate: String?
)
