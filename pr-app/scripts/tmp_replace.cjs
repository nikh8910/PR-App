const fs = require('fs');
const file = 'c:/Users/nikh8/PR/pr-app/src/pages/outbound/PickingSearch.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. fetchDropdownOptions
content = content.replace(
    /const fetchDropdownOptions = async \(type\) => {\s+setFetchingDropdown\(true\);\s+try {\s+if \(type === 'HU' && selectedWarehouse\) {\s+const res = await api\.fetchHandlingUnits\(apiConfig, { warehouse: selectedWarehouse }\);\s+if \(res && res\.value\) setDropdownOptions\(res\.value\);\s+} else if \(type === 'Product'\) {/g,
    `const fetchDropdownOptions = async (type) => {
        setFetchingDropdown(true);
        try {
            if (type === 'HU' && selectedWarehouse) {
                const res = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse });
                if (res && res.value) setDropdownOptions(res.value);
            } else if (type === 'WarehouseOrder' && selectedWarehouse) {
                const res = await api.fetchWarehouseOrders(apiConfig, { warehouse: selectedWarehouse, dateToday: true });
                if (res && res.value) setDropdownOptions(res.value.filter(o => o.WarehouseOrderStatus !== 'C'));
            } else if (type === 'Product') {`
);

// 2. useEffect for fetchDropdownOptions
content = content.replace(
    /useEffect\(\(\) => {\s+if \(searchBy === 'Product'\) {\s+fetchDropdownOptions\('Product'\);\s+} else if \(selectedWarehouse && searchBy === 'HU'\) {\s+fetchDropdownOptions\(searchBy\);\s+} else {\s+setDropdownOptions\(\[\]\);\s+}\s+}, \[searchBy, selectedWarehouse, apiConfig\]\);/g,
    `useEffect(() => {
        if (searchBy === 'Product') {
            fetchDropdownOptions('Product');
        } else if (selectedWarehouse && (searchBy === 'HU' || searchBy === 'WarehouseOrder')) {
            fetchDropdownOptions(searchBy);
        } else {
            setDropdownOptions([]);
        }
    }, [searchBy, selectedWarehouse, apiConfig]);`
);
    
// 3. filteredOptions
content = content.replace(
    /} else if \(searchBy === 'Product'\) {\s+const prodMatch = opt\.Product && opt\.Product\.toUpperCase\(\)\.includes\(upper\);\s+const eanMatch = opt\.ProductStandardID && opt\.ProductStandardID\.includes\(upper\);\s+return prodMatch \|\| eanMatch;\s+}\s+return true;\s+}\);/g,
    `} else if (searchBy === 'WarehouseOrder') {
            return opt.WarehouseOrder && opt.WarehouseOrder.toUpperCase().includes(upper);
        } else if (searchBy === 'Product') {
            const prodMatch = opt.Product && opt.Product.toUpperCase().includes(upper);
            const eanMatch = opt.ProductStandardID && opt.ProductStandardID.includes(upper);
            return prodMatch || eanMatch;
        }
        return true;
    });`
);

// 4. renderDropdownItem
content = content.replace(
    /const renderDropdownItem = \(opt\) => {\s+if \(searchBy === 'HU'\) {\s+return { val: opt\.HandlingUnitExternalID, sub: '' };\s+} else if \(searchBy === 'Product'\) {\s+return { val: opt\.Product, sub: opt\.ProductStandardID \? \`GTIN: \${opt\.ProductStandardID}\` : '' };\s+}\s+return { val: '', sub: '' };\s+};/g,
    `const renderDropdownItem = (opt) => {
        if (searchBy === 'HU') {
            return { val: opt.HandlingUnitExternalID, sub: '' };
        } else if (searchBy === 'WarehouseOrder') {
            return { val: opt.WarehouseOrder, sub: \`Created: \${opt.CreationDateTime ? opt.CreationDateTime.substring(0, 10) : ''}\` };
        } else if (searchBy === 'Product') {
            return { val: opt.Product, sub: opt.ProductStandardID ? \`GTIN: \${opt.ProductStandardID}\` : '' };
        }
        return { val: '', sub: '' };
    };`
);
    
// 5. getDropdownSelectValue
content = content.replace(
    /const getDropdownSelectValue = \(opt\) => {\s+if \(searchBy === 'HU'\) return opt\.HandlingUnitExternalID;\s+if \(searchBy === 'Product'\) return opt\.Product;\s+return '';\s+};/g,
    `const getDropdownSelectValue = (opt) => {
        if (searchBy === 'HU') return opt.HandlingUnitExternalID;
        if (searchBy === 'WarehouseOrder') return opt.WarehouseOrder;
        if (searchBy === 'Product') return opt.Product;
        return '';
    };`
);
    
// 6. Validation messages
content = content.replace(
    /if \(!finalSearchValue && searchBy === 'HU'\) {\s+setError\('Please enter a Handling Unit.'\); return;\s+}/g,
    `if (!finalSearchValue && searchBy === 'WarehouseOrder') {
            setError('Please enter a Warehouse Order.'); return;
        }
        if (!finalSearchValue && searchBy === 'HU') {
            setError('Please enter a Handling Unit.'); return;
        }`
);
        
// 7. filters setting
content = content.replace(
    /} else if \(searchBy === 'HU'\) {\s+filters\.handlingUnit = productId;/g,
    `} else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'HU') {
                filters.handlingUnit = productId;`
);
                
// 8. sessionStorage persistence
content = content.replace(
    /setTasks\(pickTasks\);\s+setCompletedTasks\(\[\]\); \/\/ Reset completed on new search\s+setCompletedFetched\(false\);\s+setShowCompleted\(false\);\s+setShowResults\(true\);\s+setLoading\(false\);/g,
    `setTasks(pickTasks);
            setCompletedTasks([]); // Reset completed on new search
            setCompletedFetched(false);
            setShowCompleted(false);
            setShowResults(true);
            setLoading(false);

            // Save search state for back navigation
            sessionStorage.setItem('pickingSearchState', JSON.stringify({
                searchBy, searchValue, selectedWarehouse, tasks: pickTasks, showResults: true
            }));`
);
            
// 9. Dropdown options
content = content.replace(
    /options={\[\s+{ value: 'OBD', label: 'Outbound Delivery' },\s+{ value: 'Product', label: 'Product \/ GTIN' },\s+{ value: 'HU', label: 'Handling Unit' }\s+\]}/g,
    `options={[
                                            { value: 'OBD', label: 'Outbound Delivery' },
                                            { value: 'WarehouseOrder', label: 'Warehouse Order' },
                                            { value: 'Product', label: 'Product / GTIN' },
                                            { value: 'HU', label: 'Handling Unit' }
                                        ]}`
);
                                        
// 10. Label changes
content = content.replace(
    /label={<span className="md:hidden">{searchBy === 'OBD' \? 'Delivery Number' : searchBy === 'HU' \? 'HU Identifier' : 'Product ID or GTIN'}<\/span>}/g,
    `label={<span className="md:hidden">{searchBy === 'OBD' ? 'Delivery Number' : searchBy === 'WarehouseOrder' ? 'Warehouse Order' : searchBy === 'HU' ? 'HU Identifier' : 'Product ID or GTIN'}</span>}`
);
    
// 11. Placeholder changes
content = content.replace(
    /placeholder={searchBy === 'OBD' \? 'Leave empty for all open OBDs' : searchBy === 'Product' \? 'Scan GTIN or type Product ID' : 'Scan or type HU'}/g,
    `placeholder={searchBy === 'OBD' ? 'Leave empty for all open OBDs' : searchBy === 'WarehouseOrder' ? 'Scan or type Order' : searchBy === 'Product' ? 'Scan GTIN or type Product ID' : 'Scan or type HU'}`
);
    
// 12. No results message
content = content.replace(
    /{searchBy === 'Product' \? 'No products found. You can still type a Product ID or GTIN.' :\s+`No handling units found.`}/g,
    `{searchBy === 'Product' ? 'No products found. You can still type a Product ID or GTIN.' :
                                                         searchBy === 'WarehouseOrder' ? 'No open Warehouse Orders found today.' :
                                                            \`No handling units found.\`}`
);

fs.writeFileSync(file, content);
console.log('Replacements complete');
