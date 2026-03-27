const fs = require('fs');
const file = 'c:/Users/nikh8/PR/pr-app/src/pages/inbound/PutawaySearch.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for dropdowns
content = content.replace(
    /const \[showFilters, setShowFilters\] = useState\(false\);\s+\/\/ Filter state for results/g,
    `const [showFilters, setShowFilters] = useState(false);

    // Dropdown state for WH Order and Product inline value help
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);

    // Filter state for results`
);

// 2. Add fetchDropdownOptions, filteredOptions, etc. right after fetchTaskEnrichedDeliveries
content = content.replace(
    /    }, \[apiConfig\]\);\s+\/\/ Initial Load: Fetch Warehouses/g,
    `    }, [apiConfig]);

    // Fetch dropdown options for WarehouseOrder and Product
    const fetchDropdownOptions = async (type) => {
        setFetchingDropdown(true);
        try {
            if (type === 'WarehouseOrder' && selectedWarehouse) {
                const res = await api.fetchWarehouseOrders(apiConfig, { warehouse: selectedWarehouse, dateToday: true });
                if (res && res.value) setDropdownOptions(res.value.filter(o => o.WarehouseOrderStatus !== 'C'));
            } else if (type === 'Product') {
                const headers = {};
                if (apiConfig.apiKey) headers['APIKey'] = apiConfig.apiKey;
                if (!headers['APIKey'] && apiConfig.username) {
                    headers['Authorization'] = 'Basic ' + btoa(apiConfig.username + ':' + apiConfig.password);
                }
                headers['Content-Type'] = 'application/json';
                headers['Accept'] = 'application/json';

                const baseUrl = api.getProductSrvUrl(apiConfig);
                let url = \`\${baseUrl}/A_ProductUnitsOfMeasureEAN?$top=50&$format=json\`;

                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) {
                        url = url.replace(/https:\\/\\/my\\d+-api\\.s4hana\\.cloud\\.sap(:443)?/g, '');
                    }
                    if (url.includes('sandbox.api.sap.com')) {
                        url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                    }
                }

                const response = await fetch(url, { headers });
                if (response.ok) {
                    const data = await response.json();
                    const results = data.d?.results || [];
                    const seen = new Map();
                    results.forEach(r => {
                        const prod = r.Product?.trim();
                        if (prod && !seen.has(prod)) {
                            seen.set(prod, {
                                Product: prod,
                                ProductStandardID: r.ProductStandardID || ''
                            });
                        }
                    });
                    setDropdownOptions(Array.from(seen.values()));
                } else {
                    setDropdownOptions([]);
                }
            } else {
                setDropdownOptions([]);
            }
        } catch (err) {
            console.error("Failed to fetch dropdown options:", err);
            setDropdownOptions([]);
        } finally {
            setFetchingDropdown(false);
        }
    };

    useEffect(() => {
        if (searchBy === 'Product') {
            fetchDropdownOptions('Product');
        } else if (selectedWarehouse && searchBy === 'WarehouseOrder') {
            fetchDropdownOptions(searchBy);
        } else {
            setDropdownOptions([]);
        }
    }, [searchBy, selectedWarehouse, apiConfig]);

    const filteredOptions = dropdownOptions.filter(opt => {
        if (!searchValue) return true;
        const upper = searchValue.toUpperCase();
        if (searchBy === 'WarehouseOrder') {
            return opt.WarehouseOrder && opt.WarehouseOrder.toUpperCase().includes(upper);
        } else if (searchBy === 'Product') {
            const prodMatch = opt.Product && opt.Product.toUpperCase().includes(upper);
            const eanMatch = opt.ProductStandardID && opt.ProductStandardID.includes(upper);
            return prodMatch || eanMatch;
        }
        return true;
    });

    const renderDropdownItem = (opt) => {
        if (searchBy === 'WarehouseOrder') {
            return { val: opt.WarehouseOrder, sub: \`Created: \${opt.CreationDateTime ? opt.CreationDateTime.substring(0, 10) : ''}\` };
        } else if (searchBy === 'Product') {
            return { val: opt.Product, sub: opt.ProductStandardID ? \`GTIN: \${opt.ProductStandardID}\` : '' };
        }
        return { val: '', sub: '' };
    };

    const getDropdownSelectValue = (opt) => {
        if (searchBy === 'WarehouseOrder') return opt.WarehouseOrder;
        if (searchBy === 'Product') return opt.Product;
        return '';
    };

    // Initial Load: Fetch Warehouses`
);

// 3. sessionStorage useEffect state restoration
content = content.replace(
    /    useEffect\(\(\) => {\s+const loadWarehouses = async \(\) => {/g,
    `    // --- State Restoration (sessionStorage) ---
    useEffect(() => {
        const saved = sessionStorage.getItem('putawaySearchState');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.searchBy) setSearchBy(parsed.searchBy);
                if (parsed.searchValue !== undefined) setSearchValue(parsed.searchValue);
                if (parsed.selectedWarehouse) setSelectedWarehouse(parsed.selectedWarehouse);
                
                let restoredTasks = parsed.results || [];
                if (window.history.state?.usr?.confirmedTaskId) {
                    restoredTasks = restoredTasks.filter(t => t.WarehouseTask !== window.history.state.usr.confirmedTaskId);
                }
                
                setResults(restoredTasks);
                if (parsed.hasSearched) setHasSearched(true);
                
                sessionStorage.setItem('putawaySearchState', JSON.stringify({
                    ...parsed,
                    results: restoredTasks
                }));
            } catch(e) { console.error('Error restoring session state', e); }
        }
    }, [window.location]);

    useEffect(() => {
        const loadWarehouses = async () => {`
);

// 4. Update validations in handleSearch
content = content.replace(
    /        if \(!finalSearchValue && searchBy === 'IBD' && !ibdSupplier && !ibdDateFrom && !ibdDateTo\) {\s+setError\('Please enter a valid Delivery Document or use the optional filters\.'\);\s+return;\s+}\s+if \(!finalSearchValue && searchBy === 'HU'\) {\s+setError\('Please enter a valid Handling Unit\.'\);\s+return;\s+}/g,
    `        if (!finalSearchValue && searchBy === 'IBD' && !ibdSupplier && !ibdDateFrom && !ibdDateTo) {
            setError('Please enter a valid Delivery Document or use the optional filters.');
            return;
        }
        if (!finalSearchValue && searchBy === 'WarehouseOrder') {
            setError('Please enter a Warehouse Order.');
            return;
        }
        if (!finalSearchValue && searchBy === 'HU') {
            setError('Please enter a valid Handling Unit.');
            return;
        }`
);

// 5. Update filters setting
content = content.replace(
    /            } else if \(searchBy === 'HU'\) {\s+filters\.handlingUnit = finalSearchValue;\s+} else if \(searchBy === 'Product'\) {/g,
    `            } else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'HU') {
                filters.handlingUnit = finalSearchValue;
            } else if (searchBy === 'Product') {`
);

// 6. sessionStorage save and update tasks state logic
content = content.replace(
    /                setResults\(tasks\);\s+}\s+} catch \(err\) {/g,
    `                setResults(tasks);
            }
            
            // Save search state for back navigation
            sessionStorage.setItem('putawaySearchState', JSON.stringify({
                searchBy, searchValue, selectedWarehouse, results: tasks, hasSearched: true
            }));
        } catch (err) {`
);

// 7. Options select additions
content = content.replace(
    /options={\[\s+{ value: "IBD", label: "Inbound Delivery" },\s+{ value: "Product", label: "Product \/ GTIN" },\s+{ value: "HU", label: "Handling Unit" }\s+\]}/g,
    `options={[
                                            { value: "IBD", label: "Inbound Delivery" },
                                            { value: "WarehouseOrder", label: "Warehouse Order" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }
                                        ]}`
);

// 8. Replace Input area for handleSearch UI layout
content = content.replace(
    /<Input\s+label={<span className="md:hidden">{searchBy === 'IBD' \? 'Delivery Number' : searchBy === 'Product' \? 'Product ID or GTIN' : 'Handling Unit'}<\/span>}\s+leftIcon={<Search size={18} className="text-gray-400" \/>}\s+placeholder={\s+searchBy === 'Product' \? 'Scan GTIN or type Product ID' :\s+\`Scan or type \${searchBy}\.\.\.\`\s+}\s+value={searchValue}\s+onChange={\(e\) => setSearchValue\(e\.target\.value\.toUpperCase\(\)\)}\s+className="uppercase font-mono"\s+rightIcon=/g,
    `<Input
                                                label={<span className="md:hidden">{searchBy === 'IBD' ? 'Delivery Number' : searchBy === 'WarehouseOrder' ? 'Warehouse Order' : searchBy === 'Product' ? 'Product ID or GTIN' : 'Handling Unit'}</span>}
                                                leftIcon={<Search size={18} className="text-gray-400" />}
                                                placeholder={
                                                    searchBy === 'Product' ? 'Scan GTIN or type Product ID' : searchBy === 'WarehouseOrder' ? 'Scan or type Order' :
                                                        \`Scan or type \${searchBy}...\`
                                                }
                                                value={searchValue}
                                                onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                                onFocus={() => { if (searchBy !== 'IBD') setIsDropdownOpen(true); }}
                                                onBlur={() => { setTimeout(() => setIsDropdownOpen(false), 200); }}
                                                className="uppercase font-mono"
                                                rightIcon=`
);

// 9. Right icon replacements
content = content.replace(
    /                                                    {searchBy === 'IBD' && \(\s+<button\s+type="button"\s+onClick={handleOpenValueHelp}\s+className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"\s+title="Browse Deliveries"\s+>\s+<List size={20} \/>\s+<\/button>\s+\)}/g,
    `                                                    {searchBy === 'IBD' && (
                                                        <button
                                                            type="button"
                                                            onClick={handleOpenValueHelp}
                                                            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"
                                                            title="Browse Deliveries"
                                                        >
                                            <List size={20} />
                                        </button>
                                                    )}
                                                    {searchBy !== 'IBD' && (
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => { 
                                                                e.preventDefault();
                                                                setIsDropdownOpen(prev => !prev); 
                                                                if (!isDropdownOpen && dropdownOptions.length === 0) fetchDropdownOptions(searchBy); 
                                                            }}
                                                            className="w-9 h-9 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue hover:bg-slate-200 rounded-md transition-colors"
                                                            title="Browse list"
                                                        >
                                                            <List size={20} />
                                                        </button>
                                                    )}`
);

// 10. Add dropdown popover right after input
content = content.replace(
    /                                        {/\* Helper text \*\/}/g,
    `                                        {/* Dropdown value help (HU & Product) */}
                                        {isDropdownOpen && searchBy !== 'IBD' && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                                {fetchingDropdown ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                        <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                    </div>
                                                ) : filteredOptions.length === 0 ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center">
                                                        {searchBy === 'Product' ? 'No products found. You can still type a Product ID or GTIN.' :
                                                         searchBy === 'WarehouseOrder' ? 'No open Warehouse Orders found today.' :
                                                            \`No handling units found.\`}
                                                    </div>
                                                ) : (
                                                    <div className="py-1">
                                                        {filteredOptions.map((opt, i) => {
                                                            const { val, sub } = renderDropdownItem(opt);
                                                            return (
                                                                <div
                                                                    key={val + '-' + i}
                                                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        setSearchValue(getDropdownSelectValue(opt));
                                                                        setIsDropdownOpen(false);
                                                                    }}
                                                                >
                                                                    <div className="font-semibold text-gray-800 text-sm">{val}</div>
                                                                    {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Helper text */}`
);

fs.writeFileSync(file, content);
console.log('Replacements complete');
