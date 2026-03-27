package com.prapp.warehouse.data.models

data class CreateWarehouseTaskRequest(
    val EWMWarehouse: String,
    val WarehouseProcessType: String,
    val Product: String? = null,
    val Batch: String? = null,
    val TargetQuantityInAltvUnit: Double? = null,
    val AlternativeUnit: String? = null,
    val EWMStockType: String? = null,
    val EntitledToDisposeParty: String? = null,
    val EWMStockOwner: String? = null,
    val SourceStorageType: String? = null,
    val SourceStorageBin: String? = null,
    val DestinationStorageType: String? = null,
    val DestinationStorageBin: String? = null,
    val SourceHandlingUnit: String? = null,
    val DestinationHandlingUnit: String? = null
)
