package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class MaterialStock(
    @SerializedName("Material") val material: String,
    @SerializedName("Plant") val plant: String,
    @SerializedName("StorageLocation") val storageLocation: String,
    @SerializedName("MatlWrhsStkQtyInMatlBaseUnit") val quantity: String,
    @SerializedName("MaterialBaseUnit") val unit: String? // Check if this field exists or needs another name
)
