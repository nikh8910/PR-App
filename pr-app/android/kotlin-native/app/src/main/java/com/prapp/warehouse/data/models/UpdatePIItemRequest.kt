package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class UpdatePIItemRequest(
    @SerializedName("QuantityInUnitOfEntry") val quantity: String,
    @SerializedName("UnitOfEntry") val unit: String
)
