package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class HandlingUnit(
    @SerializedName("HandlingUnitExternalID")
    val handlingUnitExternalID: String = "",
    
    @SerializedName("Warehouse")
    val warehouse: String? = null,
    
    @SerializedName("Plant")
    val plant: String? = null,
    
    @SerializedName("StorageLocation")
    val storageLocation: String? = null,
    
    @SerializedName("StorageBin")
    val storageBin: String? = null,
    
    @SerializedName("PackagingMaterial")
    val packagingMaterial: String? = null,
    
    @SerializedName("HandlingUnitReferenceDocument")
    val handlingUnitReferenceDocument: String? = null,
    
    @SerializedName("HandlingUnitUUID")
    val handlingUnitUUID: String? = null,
    
    @SerializedName("UUID")
    val uuid: String? = null,
    
    @SerializedName("InternalHandlingUnitUUID")
    val internalHandlingUnitUUID: String? = null,
    
    @SerializedName("HandlingUnitInternalID")
    val handlingUnitInternalID: String? = null,
    
    @SerializedName("_HandlingUnitItem")
    val handlingUnitItems: List<HandlingUnitItem>? = null
)

data class HandlingUnitItem(
    @SerializedName("HandlingUnitExternalID")
    val handlingUnitExternalID: String = "",
    
    @SerializedName("Warehouse")
    val warehouse: String? = null,
    
    @SerializedName("StockItemUUID")
    val stockItemUUID: String? = null,
    
    @SerializedName("HandlingUnitQuantity")
    val handlingUnitQuantity: String? = null,
    
    @SerializedName("HandlingUnitQuantityUnit")
    val handlingUnitQuantityUnit: String? = null,
    
    @SerializedName("HandlingUnitAltUnitOfMeasure")
    val handlingUnitAltUnitOfMeasure: String? = null,
    
    @SerializedName("Product")
    val product: String? = null,

    @SerializedName("Material")
    val material: String? = null,

    @SerializedName("MaterialDescription")
    val materialDescription: String? = null,
    
    @SerializedName("StorageBin")
    val storageBin: String? = null,

    @SerializedName("Quantity")
    val quantity: String? = null,

    @SerializedName("QuantityUnit")
    val quantityUnit: String? = null
)
