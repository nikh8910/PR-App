package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class StockItem(
    @SerializedName("Material")
    val material: String = "",
    
    @SerializedName("MaterialDescription")
    val materialDescription: String? = null,
    
    @SerializedName("Plant")
    val plant: String? = null,
    
    @SerializedName("StorageLocation")
    val storageLocation: String? = null,
    
    @SerializedName("MatlWrhsStkQtyInMatlBaseUnit")
    val matlWrhsStkQtyInMatlBaseUnit: String? = null,
    
    @SerializedName("MaterialBaseUnit")
    val materialBaseUnit: String? = null,
    
    @SerializedName("InventoryStockType")
    val inventoryStockType: String? = null,
    
    @SerializedName("StockType")
    val stockType: String? = null,
    
    @SerializedName("StockValue")
    val stockValue: String? = null,
    
    @SerializedName("StockValueInCompCodeCrcy")
    val stockValueInCompCodeCrcy: String? = null,
    
    @SerializedName("InventoryValue")
    val inventoryValue: String? = null,
    
    @SerializedName("CompanyCodeCurrency")
    val companyCodeCurrency: String? = null,
    
    @SerializedName("Currency")
    val currency: String? = null
)

// OData V4 EWM Warehouse Physical Stock Items
data class WarehouseStockItem(
    @SerializedName("StockItemUUID")
    val stockItemUUID: String = "",
    
    @SerializedName("Product")
    val product: String? = null,
    
    @SerializedName("EWMStockQuantityBaseUnit")
    val ewmStockQuantityBaseUnit: String? = null,
    
    @SerializedName("EWMStockQuantityInBaseUnit")
    val ewmStockQuantityInBaseUnit: String? = null,
    
    @SerializedName("EWMStockQuantityAltvUnit")
    val ewmStockQuantityAltvUnit: String? = null,
    
    @SerializedName("Batch")
    val batch: String? = null,
    
    @SerializedName("EWMStorageBin")
    val ewmStorageBin: String? = null,
    
    @SerializedName("EWMStorageType")
    val ewmStorageType: String? = null,
    
    @SerializedName("EWMConsolidationGroup")
    val ewmConsolidationGroup: String? = null,
    
    @SerializedName("EWMWarehouse")
    val ewmWarehouse: String? = null,
    
    @SerializedName("HandlingUnitExternalID")
    val handlingUnitExternalID: String? = null,
    
    @SerializedName("EWMDocumentCategory")
    val ewmDocumentCategory: String? = null,
    
    @SerializedName("EWMStockReferenceDocument")
    val ewmStockReferenceDocument: String? = null,
    
    @SerializedName("EWMStockReferenceDocumentItem")
    val ewmStockReferenceDocumentItem: String? = null,

    // Available Stock specific fields
    @SerializedName("AvailableEWMStockQty")
    val availableEWMStockQty: String? = null,

    @SerializedName("EWMStockType")
    val ewmStockType: String? = null,

    @SerializedName("EWMStockOwner")
    val ewmStockOwner: String? = null,

    @SerializedName("WarehouseAvailableStockUUID")
    val warehouseAvailableStockUUID: String? = null
)
