package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class PurchaseOrderItem(
    @SerializedName("PurchaseOrder") val purchaseOrder: String,
    @SerializedName("PurchaseOrderItem") val purchaseOrderItem: String,
    @SerializedName("Material") val material: String,
    @SerializedName("PurchaseOrderItemText") val itemText: String,
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String?,
    @SerializedName("OrderQuantity") val orderQuantity: String,
    @SerializedName("PurchaseOrderQuantityUnit") val unit: String,
    @SerializedName("NetPriceAmount") val netPrice: String? = null,
    @SerializedName("DocumentCurrency") val documentCurrency: String? = null,
    @SerializedName("PurchasingGroup") val purchasingGroup: String? = null,
    @SerializedName("PurchaseRequisition") val purchaseRequisition: String? = null,
    @SerializedName("PurchaseRequisitionItem") val purchaseRequisitionItem: String? = null,
    @SerializedName("MaterialGroup") val materialGroup: String? = null,
    
    // Local fields for UI state
    @Transient var grQuantity: String = "",
    @Transient var grStorageLocation: String = ""
)
