package com.prapp.warehouse.data.models

data class PurchaseRequisitionItem(
    val PurchaseRequisition: String? = null,
    val PurchaseRequisitionItem: String,
    val Material: String? = null,
    val PurchaseRequisitionItemText: String? = null,
    val MaterialGroup: String? = null,
    val RequestedQuantity: String? = null,
    val BaseUnit: String? = null,
    val BaseUnitISOCode: String? = null,
    val FixedSupplier: String? = null,
    val Supplier: String? = null,
    val DeliveryDate: String? = null,
    val PurchaseRequisitionPrice: String? = null,
    val PurReqnItemCurrency: String? = null,
    val Plant: String? = null,
    val StorageLocation: String? = null,
    val CompanyCode: String? = null,
    val AccountAssignmentCategory: String? = null,
    val PurchasingGroup: String? = null,
    val CreatedByUser: String? = null,
    val PurReqCreationDate: String? = null
)
