import os

file_path = "c:/Users/nikh8/PR/pr-app/src/pages/inbound/PutawaySearch.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State
content = content.replace(
    "const [showFilters, setShowFilters] = useState(false);",
    """const [showFilters, setShowFilters] = useState(false);

    // Dropdown state for WH Order and Product inline value help
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);"""
)

# 2. Fetch logic and Session restored
target_2 = """    // Initial Load: Fetch Warehouses
    useEffect(() => {
        const loadWarehouses = async () => {"""
replace_2 = """    // Fetch dropdown options for WarehouseOrder and Product
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
                let url = `${baseUrl}/A_ProductUnitsOfMeasureEAN?$top=50&$format=json`;

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
            return { val: opt.WarehouseOrder, sub: `Created: ${opt.CreationDateTime ? opt.CreationDateTime.substring(0, 10) : ''}` };
        } else if (searchBy === 'Product') {
            return { val: opt.Product, sub: opt.ProductStandardID ? `GTIN: ${opt.ProductStandardID}` : '' };
        }
        return { val: '', sub: '' };
    };

    const getDropdownSelectValue = (opt) => {
        if (searchBy === 'WarehouseOrder') return opt.WarehouseOrder;
        if (searchBy === 'Product') return opt.Product;
        return '';
    };

    // --- State Restoration (sessionStorage) ---
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
    }, [location]);

    // Initial Load: Fetch Warehouses
    useEffect(() => {
        const loadWarehouses = async () => {"""
content = content.replace(target_2, replace_2)

# 3. Validation
content = content.replace(
    "if (!finalSearchValue && searchBy === 'HU') {",
    """if (!finalSearchValue && searchBy === 'WarehouseOrder') {
            setError('Please enter a Warehouse Order.');
            return;
        }
        if (!finalSearchValue && searchBy === 'HU') {"""
)

# 4. Filters routing
content = content.replace(
    "} else if (searchBy === 'HU') {",
    """} else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'HU') {"""
)

# 5. SessionStorage save
target_5 = """            } else {
                // Show all tasks (open + completed) — user will filter
                setResults(tasks);
            }
        } catch (err) {"""
replace_5 = """            } else {
                // Show all tasks (open + completed) — user will filter
                setResults(tasks);
            }
            
            // Save search state for back navigation
            sessionStorage.setItem('putawaySearchState', JSON.stringify({
                searchBy, searchValue, selectedWarehouse, results: tasks, hasSearched: true
            }));
        } catch (err) {"""
content = content.replace(target_5, replace_5)

# 6. Options select
content = content.replace(
    """                                            { value: "IBD", label: "Inbound Delivery" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }""",
    """                                            { value: "IBD", label: "Inbound Delivery" },
                                            { value: "WarehouseOrder", label: "Warehouse Order" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }"""
)


# 7. Placeholder and label
content = content.replace(
    "searchBy === 'IBD' ? 'Delivery Number' : searchBy === 'Product' ? 'Product ID or GTIN' : 'Handling Unit'",
    "searchBy === 'IBD' ? 'Delivery Number' : searchBy === 'WarehouseOrder' ? 'Warehouse Order' : searchBy === 'Product' ? 'Product ID or GTIN' : 'Handling Unit'"
)

# Input props and dropdown popup
target_input = """                                                placeholder={
                                                    searchBy === 'Product' ? 'Scan GTIN or type Product ID' :
                                                        `Scan or type ${searchBy}...`
                                                }
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                            className="uppercase font-mono"
                                            rightIcon={
                                                <div className="flex items-center gap-1">
                                                    {searchBy === 'IBD' && (
                                                        <button
                                                            type="button"
                                                            onClick={handleOpenValueHelp}
                                                            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"
                                                            title="Browse Deliveries"
                                                        >
                                            <List size={20} />
                                        </button>
                                                    )}
                                                    {searchValue && ("""

replace_input = """                                                placeholder={
                                                    searchBy === 'Product' ? 'Scan GTIN or type Product ID' : searchBy === 'WarehouseOrder' ? 'Scan or type Order' :
                                                        `Scan or type ${searchBy}...`
                                                }
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                            onFocus={() => { if (searchBy !== 'IBD') setIsDropdownOpen(true); }}
                                            onBlur={() => { setTimeout(() => setIsDropdownOpen(false), 200); }}
                                            className="uppercase font-mono"
                                            rightIcon={
                                                <div className="flex items-center gap-1">
                                                    {searchBy === 'IBD' && (
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
                                                    )}
                                                    {searchValue && ("""

content = content.replace(target_input, replace_input)

# Dropdown helper
target_dropdown = """                                        {/* Helper text */}"""
replace_dropdown = """                                        {/* Dropdown value help (HU & Product) */}
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
                                                            `No handling units found.`}
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
                                        
                                        {/* Helper text */}"""
content = content.replace(target_dropdown, replace_dropdown)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"File updated. Was dropdown logic added? {replace_dropdown in content}")
print(f"Was search logic added? {replace_5 in content}")
