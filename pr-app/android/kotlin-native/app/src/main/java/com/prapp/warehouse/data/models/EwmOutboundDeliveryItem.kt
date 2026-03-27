package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class EwmOutboundDeliveryItem(
    @SerializedName("EWMOutboundDeliveryOrder") val EWMOutboundDeliveryOrder: String? = null,
    @SerializedName("EWMOutboundDeliveryOrderItem") val EWMOutboundDeliveryOrderItem: String? = null,
    @SerializedName("EWMWarehouse") val EWMWarehouse: String? = null,
    @SerializedName("Product") val Product: String? = null,
    @SerializedName("ProductName") val ProductName: String? = null,
    @SerializedName("ProductDescription") val ProductDescription: String? = null,
    @SerializedName("MaterialDescription") val MaterialDescription: String? = null,
    @SerializedName("Batch") val Batch: String? = null,
    @SerializedName("PickingStatus") val PickingStatus: String? = null,
    @SerializedName("WarehouseProcessingStatus") val WarehouseProcessingStatus: String? = null,
    @SerializedName("DeliveryQuantityInBaseUnit") val DeliveryQuantityInBaseUnit: String? = null,
    @SerializedName("OrderQuantityInBaseUnit") val OrderQuantityInBaseUnit: String? = null,
    @SerializedName("ProductQuantity") val ProductQuantity: String? = null,
    @SerializedName("BaseUnit") val BaseUnit: String? = null,
    @SerializedName("QuantityUnit") val QuantityUnit: String? = null,
    @SerializedName("SourceStorageBin") val SourceStorageBin: String? = null,
    @SerializedName("EWMStorageBin") val EWMStorageBin: String? = null,
    @SerializedName("EWMStorageType") val EWMStorageType: String? = null,
    @SerializedName("HandlingUnitNumber") val HandlingUnitNumber: String? = null,
    @SerializedName("EWMConsolidationGroup") val EWMConsolidationGroup: String? = null,
    @SerializedName("ShipToParty") val ShipToParty: String? = null,
    @SerializedName("Route") val Route: String? = null
)
