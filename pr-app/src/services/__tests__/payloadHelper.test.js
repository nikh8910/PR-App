import { constructGRPayload } from './payloadHelper.js';

console.log("Running Tests for payloadHelper.js...");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        testsPassed++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        testsFailed++;
    }
}

function expect(actual, expected) {
    return actual === expected;
}

// Test 1: Basic Payload Construction
try {
    const item = {
        PurchaseOrder: "4500001234",
        PurchaseOrderItem: "10",
        Plant: "1010",
        PurchaseOrderQuantityUnit: "PC",
        Material: "TG11"
    };

    const payload = constructGRPayload({
        item,
        quantity: 5,
        date: "2023-10-25",
        headerText: "Test GR",
        deliveryNote: "DN123"
    });

    assert(payload.GoodsMovementCode === "01", "GoodsMovementCode should be '01'");
    assert(payload.PostingDate === "2023-10-25T00:00:00", "PostingDate format correct");
    assert(payload.ReferenceDocument === "DN123", "Delivery Note mapped to ReferenceDocument");

    const grItem = payload.to_MaterialDocumentItem[0];
    assert(grItem.PurchaseOrder === "4500001234", "PO Number mapped");
    assert(grItem.PurchaseOrderItem === "00010", "PO Item mapped");
    assert(grItem.GoodsMovementType === "101", "Movement Type is 101");
    assert(grItem.QuantityInEntryUnit === "5", "Quantity mapped as string");
    console.log("Payload Structure:", JSON.stringify(payload, null, 2));

} catch (e) {
    console.error("Test Crashed:", e);
    testsFailed++;
}

console.log(`\nSummary: ${testsPassed} Passed, ${testsFailed} Failed.`);
if (testsFailed > 0) process.exit(1);
