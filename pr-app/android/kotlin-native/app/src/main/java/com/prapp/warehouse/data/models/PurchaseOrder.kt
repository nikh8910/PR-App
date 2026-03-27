package com.prapp.warehouse.data.models

import com.google.gson.annotations.SerializedName

data class PurchaseOrder(
    @SerializedName("PurchaseOrder") val purchaseOrder: String? = null,
    @SerializedName("Supplier") val supplier: String?,
    @SerializedName("PurchaseOrderDate") val purchaseOrderDate: String? = null,
    @SerializedName("PurchaseOrderStatus") val purchaseOrderStatus: String? = null,
    @SerializedName("CompanyCode") val companyCode: String? = null,
    @SerializedName("PurchaseOrderType") val purchaseOrderType: String? = null,
    @SerializedName("PurchasingOrganization") val purchasingOrganization: String? = null,
    @SerializedName("PurchasingGroup") val purchasingGroup: String? = null,
    @SerializedName("DocumentCurrency") val documentCurrency: String? = null,
    @SerializedName("to_PurchaseOrderItem") val toPurchaseOrderItem: List<PurchaseOrderItem>? = null
)
