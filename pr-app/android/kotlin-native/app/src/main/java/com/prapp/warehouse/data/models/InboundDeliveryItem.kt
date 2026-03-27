package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class InboundDeliveryItem(
    @SerializedName("DeliveryDocument") val deliveryDocument: String,
    @SerializedName("DeliveryDocumentItem") val deliveryDocumentItem: String,
    @SerializedName("Material") val material: String,
    @SerializedName("DeliveryDocumentItemText") val itemText: String,
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String?,
    @SerializedName("ActualDeliveryQuantity") val deliveryQuantity: String,
    @SerializedName("DeliveryQuantityUnit") val unit: String,
    @SerializedName("ReferenceSDDocument") val refPO: String?, // PO Number
    @SerializedName("ReferenceSDDocumentItem") val refPOItem: String?, // PO Item
    
    // Local fields for UI state
    @Transient var putawayQuantity: String = "",
    @Transient var putawayStorageLocation: String = ""
)
