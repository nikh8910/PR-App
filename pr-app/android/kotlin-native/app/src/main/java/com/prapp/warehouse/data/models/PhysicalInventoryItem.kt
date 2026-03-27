package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class PhysicalInventoryItem(
    @SerializedName("PhysicalInventoryDocument") val piDocument: String,
    @SerializedName("PhysicalInventoryDocumentItem") val piItem: String,
    @SerializedName("FiscalYear") val fiscalYear: String,
    @SerializedName("Material") val material: String,
    @SerializedName("Batch") val batch: String?, // Often relevant for PI
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String?,
    @SerializedName("QuantityInUnitOfEntry") val quantity: String?, // The count quantity
    @SerializedName("UnitOfEntry") val unit: String,
    @SerializedName("ItemIsCounted") val isCounted: Boolean?,
    
     // Metadata for ETag
    @SerializedName("__metadata") val metadata: Metadata?
)
