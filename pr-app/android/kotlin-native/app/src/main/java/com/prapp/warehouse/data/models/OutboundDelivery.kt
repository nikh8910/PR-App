package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class OutboundDelivery(
    @SerializedName("DeliveryDocument") val deliveryDocument: String,
    @SerializedName("DeliveryDate") val deliveryDate: String?,
    @SerializedName("OverallGoodsMovementStatus") val overallStatus: String?, // "A"=Not processed, "B"=Partially, "C"=Completed
    @SerializedName("ActualGoodsMovementDate") val goodsMovementDate: String?,
    @SerializedName("ShippingPoint") val shippingPoint: String?,
    @SerializedName("PlannedGoodsIssueDate") val plannedGoodsIssueDate: String?
)
