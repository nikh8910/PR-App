package com.prapp.warehouse.data.models

data class WarehouseStorageType(
    val EWMWarehouse: String = "",
    val EWMStorageType: String = "",
    val EWMStorageTypeName: String? = null
)

data class WarehouseStorageBin(
    val EWMWarehouse: String = "",
    val EWMStorageBin: String = "",
    val EWMStorageType: String? = null
)
