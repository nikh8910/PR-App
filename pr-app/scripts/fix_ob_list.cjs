const fs = require('fs');

const inboundCode = fs.readFileSync('src/pages/inbound/InboundDeliveryList.jsx', 'utf8');

let outboundCode = inboundCode
    // 1. Component name
    .replace(/InboundDeliveryList/g, 'OutboundDeliveryList')
    
    // 2. Icon
    .replace('PackageOpen', 'Package')
    
    // 3. API calls
    .replace(/fetchInboundDeliveriesA2X/g, 'fetchOutboundDeliveriesA2X')
    .replace(/fetchIMInboundDeliveryHeader/g, 'fetchIMOutboundDeliveryHeader')
    
    // 4. EWM Property names
    .replace(/EWMInboundDelivery/g, 'EWMOutboundDeliveryOrder')
    
    // 5. Routes
    .replace(/\/warehouse-inbound\/deliveries/g, '/warehouse-outbound/deliveries')
    
    // 6. Supplier -> Ship-To
    .replace(/getSupplierName/g, 'getShipToPartyName')
    .replace(/supplierName/g, 'shipToName')
    .replace(/supplier/g, 'ship-to')
    .replace(/Supplier/g, 'Ship-To')
    
    // 7. GR -> GI
    .replace(/GR:/g, 'GI:')
    .replace(/getGRStatus/g, 'getGIStatus')
    .replace(/grStatus/g, 'giStatus')
    
    // 8. SearchBy
    .replace(/IBD/g, 'OBD')
    
    // 9. 'Inbound' -> 'Outbound' (text)
    .replace(/No Inbound Deliveries Found/g, 'No Outbound Deliveries Found')
    .replace(/inbound deliveries/g, 'outbound deliveries');

// Now, replace the getSupplierName function logic with getShipToPartyName logic
outboundCode = outboundCode.replace(
    /const getShipToPartyName = \(imData, fallbackDoc\) => \{[\s\S]*?return fallbackDoc.*?;\n    \};/,
    `const getShipToPartyName = (imData, fallbackDoc) => {
        if (imData?.to_DeliveryDocumentPartner?.results) {
            const shipToPartner = imData.to_DeliveryDocumentPartner.results.find(p => p.PartnerFunction === 'WE' || p.PartnerFunction === 'SH');
            if (shipToPartner && shipToPartner.AddressName) return shipToPartner.AddressName;
        }
        return fallbackDoc.ShipToPartyName || fallbackDoc.ShipToParty || 'N/A';
    };`
);

// We need to fix the getGIStatus logic since Inbound uses OverallGoodsMovementStatus but OBD uses GoodsIssueStatus
outboundCode = outboundCode.replace(
    /const getGIStatus = \(doc\) => doc\.imData\?\.OverallGoodsMovementStatus \|\| doc\.WarehouseProcessingStatus \|\| 'A';/,
    `const getGIStatus = (doc) => doc.GoodsIssueStatus || doc.WarehouseProcessingStatus || 'A';`
);

fs.writeFileSync('src/pages/outbound/OutboundDeliveryList.jsx', outboundCode);
console.log('Successfully regenerated OutboundDeliveryList.jsx from InboundDeliveryList.jsx template.');
