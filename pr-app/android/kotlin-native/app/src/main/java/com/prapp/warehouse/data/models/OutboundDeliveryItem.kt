package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class OutboundDeliveryItem(
    @SerializedName("DeliveryDocument") val deliveryDocument: String,
    @SerializedName("DeliveryDocumentItem") val deliveryDocumentItem: String,
    @SerializedName("Material") val material: String,
    @SerializedName("DeliveryDocumentItemText") val itemText: String,
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String?,
    @SerializedName("ActualDeliveryQuantity") val pickedQuantity: String, // Acts as Picked Qty
    @SerializedName("OriginalDeliveryQuantity") val deliveryQuantity: String?, // Target Qty (might be named differently in API, check JSON if needed)
    @SerializedName("DeliveryQuantityUnit") val unit: String,
    @SerializedName("PickingStatus") val pickingStatus: String?, // "A", "B", "C"
    
    // Metadata for ETag
    @SerializedName("__metadata") val metadata: Metadata?
)

data class Metadata(
    @SerializedName("etag") val etag: String?
)
