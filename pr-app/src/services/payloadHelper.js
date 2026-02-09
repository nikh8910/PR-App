/**
 * Constructs the payload for API_MATERIAL_DOCUMENT_SRV Goods Receipt.
 * 
 * @param {Object} params
 * @param {Object} params.item - The PO Item data
 * @param {string} params.quantity - Quantity to post
 * @param {string} params.date - Posting/Document Date (YYYY-MM-DD)
 * @param {string} params.headerText - Header Text
 * @param {string} params.deliveryNote - Delivery Note (Reference)
 * @returns {Object} Payload for A_MaterialDocumentHeader
 */
export const constructGRPayload = ({ item, quantity, date, headerText, deliveryNote, storageLocation }) => {
    // Format Date: The API standard often accepts YYYY-MM-DD or /Date(...)/. 
    // Standard V2/V4 generally accepts YYYY-MM-DDT00:00:00.
    // API_MATERIAL_DOCUMENT_SRV commonly uses standard JSON date format or string.
    // Based on standard S/4HANA Cloud APIs, YYYY-MM-DDT00:00:00 is safest for V2 JSON.
    const formattedDate = `${date}T00:00:00`;

    return {
        "GoodsMovementCode": "01", // Goods Receipt
        "PostingDate": formattedDate,
        "DocumentDate": formattedDate,
        "MaterialDocumentHeaderText": headerText || "",
        "ReferenceDocument": deliveryNote || "",
        "to_MaterialDocumentItem": [
            {
                "PurchaseOrder": item.PurchaseOrder,
                "PurchaseOrderItem": String(item.PurchaseOrderItem).padStart(5, '0'),
                "Plant": item.Plant,
                "GoodsMovementType": "101", // GR for PO
                "EntryUnit": item.PurchaseOrderQuantityUnit || "",
                "QuantityInEntryUnit": String(quantity), // Ensure string if API strictly checks type, or number. Schema says 'decimal' string usually.
                "Material": item.Material || "",
                "GoodsMovementRefDocType": "B", // B = Purchase Order
                "StorageLocation": storageLocation || item.StorageLocation || ""
            }
        ]
    };
};
