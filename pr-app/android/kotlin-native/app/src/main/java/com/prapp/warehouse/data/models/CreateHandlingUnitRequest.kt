package com.prapp.warehouse.data.models

data class CreateHandlingUnitRequest(
    val PackagingMaterial: String,
    val Plant: String,
    val StorageLocation: String?
)
