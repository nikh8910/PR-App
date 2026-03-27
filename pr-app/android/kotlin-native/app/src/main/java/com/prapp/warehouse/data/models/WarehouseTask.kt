package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class WarehouseTask(
    @SerializedName("WarehouseTask")
    val warehouseTask: String = "",
    
    @SerializedName("WarehouseTaskItem")
    val warehouseTaskItem: String = "",
    
    @SerializedName("EWMWarehouse")
    val ewmWarehouse: String? = null,
    
    @SerializedName("EWMDelivery")
    val ewmDelivery: String? = null,
    
    @SerializedName("SourceHandlingUnit")
    val sourceHandlingUnit: String? = null,
    
    @SerializedName("DestinationHandlingUnit")
    val destinationHandlingUnit: String? = null,
    
    @SerializedName("WarehouseTaskStatus")
    val warehouseTaskStatus: String? = null,
    
    @SerializedName("WarehouseActivityType")
    val warehouseActivityType: String? = null,
    
    @SerializedName("WarehouseProcessType")
    val warehouseProcessType: String? = null,
    
    @SerializedName("Product")
    val product: String? = null,
    
    @SerializedName("SourceStorageBin")
    val sourceStorageBin: String? = null,
    
    @SerializedName("DestinationStorageBin")
    val destinationStorageBin: String? = null,
    
    @SerializedName("TargetQuantityInBaseUnit")
    val targetQuantityInBaseUnit: String? = null,
    
    @SerializedName("BaseUnit")
    val baseUnit: String? = null,
    
    @SerializedName("TargetQuantityInAltvUnit")
    val targetQuantityInAltvUnit: String? = null,
    
    @SerializedName("AlternativeUnit")
    val alternativeUnit: String? = null,
    
    @SerializedName("SourceStorageType")
    val sourceStorageType: String? = null,
    
    @SerializedName("DestinationStorageType")
    val destinationStorageType: String? = null,
    
    @SerializedName("EWMStockReferenceDocument")
    val ewmStockReferenceDocument: String? = null
)
