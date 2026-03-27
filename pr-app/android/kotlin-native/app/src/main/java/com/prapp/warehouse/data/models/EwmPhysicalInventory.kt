package com.prapp.warehouse.data.models

data class EwmPhysicalInventoryItem(
    val EWMWarehouse: String = "",
    val PhysicalInventoryDocYear: String = "",
    val PhysicalInventoryDocNumber: String = "",
    val PhysicalInventoryItemNumber: String = "",
    val PhysicalInventoryItemType: String? = null,
    val PhysicalInventoryDocumentType: String? = null,
    val EWMStorageType: String? = null,
    val EWMStorageBin: String? = null,
    val Product: String? = null,
    val Batch: String? = null,
    val EWMPhysInvtryReason: String? = null,
    val PhysicalInventoryStatusText: String? = null,
    val PhysicalInventoryCountUserName: String? = null,
    val EWMPhysInvtryDifferenceReason: String? = null,
    val HandlingUnitExternalID: String? = null,
    val _WhsePhysicalInventoryCntItem: List<EwmPhysicalInventoryCountItem>? = null
)

data class EwmPhysicalInventoryCountItem(
    val EWMWarehouse: String = "",
    val PhysicalInventoryDocYear: String = "",
    val PhysicalInventoryDocNumber: String = "",
    val PhysicalInventoryItemNumber: String = "",
    val LineIndexOfPInvItem: String = "",
    val PInvQuantitySequence: String = "",
    val Product: String? = null,
    val RequestedQuantity: Double? = null,
    val RequestedQuantityUnit: String? = null,
    val ParentHandlingUnitNumber: String? = null,
    val HandlingUnitNumber: String? = null,
    val PhysicalInventoryItemType: String? = null,
    val EWMStorageBinIsEmpty: Boolean = false,
    val PInvIsZeroCount: Boolean = false,
    val HndlgUnitItemCountedIsComplete: Boolean = false,
    val HndlgUnitItemCountedIsEmpty: Boolean = false,
    val HndlgUnitItemCountedIsNotExist: Boolean = false,
    val EWMStorageBin: String? = null
)
