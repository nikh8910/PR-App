package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class PhysicalInventoryDoc(
    @SerializedName("PhysicalInventoryDocument") val piDocument: String,
    @SerializedName("FiscalYear") val fiscalYear: String,
    @SerializedName("Plant") val plant: String?,
    @SerializedName("StorageLocation") val storageLocation: String?,
    @SerializedName("PhysicalInventoryPlannedDate") val plannedDate: String?,
    @SerializedName("PhysicalInventoryCountStatus") val countStatus: String?
)
