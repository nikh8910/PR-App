package com.prapp.warehouse.data.models

data class PurchaseRequisition(
    val PurchaseRequisition: String,
    val PurchaseRequisitionType: String? = null,
    val PurReqnDescription: String? = null,
    val _PurchaseRequisitionItem: List<PurchaseRequisitionItem>? = null
)
