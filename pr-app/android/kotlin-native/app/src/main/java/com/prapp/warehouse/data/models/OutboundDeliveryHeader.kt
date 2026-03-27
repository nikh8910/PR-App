package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class OutboundDeliveryHeader(
    @SerializedName("EWMOutboundDeliveryOrder") val EWMOutboundDeliveryOrder: String? = null,
    @SerializedName("EWMWarehouse") val EWMWarehouse: String? = null,
    @SerializedName("ShipToParty") val ShipToParty: String? = null,
    @SerializedName("ShipToPartyName") val ShipToPartyName: String? = null,
    @SerializedName("WarehouseProcessingStatus") val WarehouseProcessingStatus: String? = null,
    @SerializedName("GoodsIssueStatus") val GoodsIssueStatus: String? = null,
    @SerializedName("PlannedDeliveryUTCDateTime") val PlannedDeliveryUTCDateTime: String? = null,
    @SerializedName("DeliveryDate") val DeliveryDate: String? = null,
    @SerializedName("CreationDate") val CreationDate: String? = null
)
