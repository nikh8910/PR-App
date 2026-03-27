package com.prapp.warehouse.data.models

data class MoveStockRequest(
    val d: MoveStockData
)

data class MoveStockData(
    val DocumentDate: String,
    val PostingDate: String,
    val GoodsMovementCode: String = "04",
    val DocumentHeaderText: String = "Mob Move",
    val to_MaterialDocumentItem: List<MoveStockItem>
)

data class MoveStockItem(
    val Material: String,
    val Plant: String,
    val StorageLocation: String?,
    val IssuingOrReceivingPlant: String?,
    val IssuingOrReceivingStorageLoc: String?,
    val GoodsMovementType: String,
    val QuantityInEntryUnit: String,
    val EntryUnit: String = "EA"
)
