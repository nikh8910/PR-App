export const getHeaders = (config) => {
    // Use plain objects for headers to ensure maximum compatibility with native plugins
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (config.apiKey) {
        headers['APIKey'] = config.apiKey;
    } else if (config.username) {
        const user = String(config.username).trim();
        const pass = String(config.password).trim();
        try {
            headers['Authorization'] = 'Basic ' + btoa(user + ":" + pass);
        } catch (e) {
            console.warn('Header encoding failed', e);
        }
    }
    return headers;
};

// Helper to use proxy in dev
const getProxyUrl = (url) => {
    // Only use proxy rewrites in Development Mode (npm run dev)
    // In Production/Android Build, we must use the full absolute URL
    if (import.meta.env.DEV) {
        // Check for any standard S/4HANA Cloud API hostname pattern
        if (url.includes('api.s4hana.cloud.sap')) {
            // Replace the full origin with empty string to leave just the path, which Vite proxy will pick up
            // We need to handle port 443 explicitly if present
            return url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
        }
        if (url.includes('sandbox.api.sap.com')) {
            return url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
        }
    }
    return url;
};

const resolvePRBase = (config) => {
    let base = config.baseUrl.replace(/\/+$/, '');
    if (base.endsWith('/PurchaseReqn')) {
        return base;
    }
    return `${base}/PurchaseReqn`;
};

export const api = {
    fetchPRs: async (config, top = 10) => {
        const headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);
        let url = `${baseUrl}?$top=${top}&$expand=_PurchaseRequisitionItem&$orderby=PurchaseRequisition desc`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            if (response.status === 401) throw new Error("Authentication Failed: Invalid credentials.");

            const errorText = await response.text();
            if (errorText.trim().startsWith('<')) {
                throw new Error(`Server Error: ${response.status}. The API URL might be incorrect or the service is down.`);
            }
            throw new Error(`Failed to fetch PRs: ${response.status} ${errorText}`);
        }
        try {
            return await response.json();
        } catch (e) {
            console.error("JSON Parse Error:", e);
            throw new Error("Invalid Server Response (Not JSON). Check API URL or Network.");
        }
    },

    fetchMaterialDocumentsForPO: async (config, poNumber) => {
        try {
            const headers = getHeaders(config);
            // Use getPOUrl as a reliable base, then switch service
            const poBaseUrl = api.getPOUrl(config);
            let baseUrl = poBaseUrl.replace('API_PURCHASEORDER_PROCESS_SRV', 'API_MATERIAL_DOCUMENT_SRV');

            // Fallback: If for some reason the swap didn't work (e.g. getPOUrl returned something custom), try standard pattern
            if (baseUrl === poBaseUrl) {
                console.warn("Service swap failed in fetchMaterialDocumentsForPO, trying generic construction.");
                if (poBaseUrl.includes('/sap/opu/')) {
                    const root = poBaseUrl.substring(0, poBaseUrl.indexOf('/sap/opu/'));
                    baseUrl = `${root}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV`;
                }
            }

            console.log("Fetching Mat Docs from:", baseUrl);

            // Construct query: Filter by PO, Select specific fields to minimize payload
            const query = `$filter=PurchaseOrder eq '${poNumber}'&$select=PurchaseOrderItem,QuantityInEntryUnit,DebitCreditCode,GoodsMovementType,IsCompletelyDelivered`;
            let url = `${baseUrl}/A_MaterialDocumentItem?${query}`;
            url = getProxyUrl(url);

            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`Failed to fetch material docs: ${response.statusText}`);
            const data = await response.json();
            return data.d.results || [];
        } catch (error) {
            console.warn("Error fetching material documents for PO:", error);
            return []; // Return empty array on failure to allow fallback to OrderQty
        }
    },

    validateCredentials: async (config) => {
        const headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);

        let url = `${baseUrl}?$top=1`;
        url = getProxyUrl(url);

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                if (response.status === 401) throw new Error("Invalid username or password.");
                if (response.status === 403) throw new Error("Access Denied (403). Check permissions.");
                if (response.status === 404) throw new Error("API Endpoint not found. Check URL.");
                throw new Error(`Connection refused: ${response.status}`);
            }
            return true;
        } catch (error) {
            throw error;
        }
    },

    searchPRs: async (config, term) => {
        const headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);
        let url = `${baseUrl}?$filter=contains(PurchaseRequisition,'${term}')&$expand=_PurchaseRequisitionItem&$orderby=PurchaseRequisition desc`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to search PRs: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchPR: async (config, prNumber) => {
        const headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);
        let url = `${baseUrl}/${prNumber}?$expand=_PurchaseRequisitionItem`;
        url = getProxyUrl(url);
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch PR ${prNumber}: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    createPR: async (config, data) => {
        let headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);
        let url = baseUrl;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        // Create new object for token headers to avoid mutation issues
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };

        const tokenResponse = await fetch(`${url}?$top=1`, {
            method: 'GET',
            headers: tokenHeaders
        });

        // Robust CSRF extraction for both Headers object and POJO response
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform the POST call
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create PR: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    addItemToPR: async (config, prId, itemData) => {
        let headers = getHeaders(config);
        const baseUrl = resolvePRBase(config);
        let url = `${baseUrl}('${prId}')/_PurchaseRequisitionItem`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${baseUrl}('${prId}')`);

        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });

        // Robust CSRF extraction
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform POST
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to add item: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Goods Receipt Methods ---

    getGRUrl: (config) => {
        // Strip trailing entity set if present
        let url = config.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, '');

        // Simple replacement strategy for S/4HANA Cloud URLs
        if (url.includes('api_purchaserequisition_2')) {
            return url.replace('api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001', 'api_material_document_srv/srvd_a2x/sap/materialdocument/0001');
        }
        // Fallback for generic paths or standard OData Service
        if (url.includes('purchaserequisition')) {
            // Check if we need to switch to Standard OData V2
            return url.replace('purchaserequisition', 'API_MATERIAL_DOCUMENT_SRV');
        }

        // If the user provided a generic base, try to append/replace for API_MATERIAL_DOCUMENT_SRV
        // Assuming standard /sap/opu/odata/sap/ path structure if we are guessing
        if (url.includes('/sap/opu/odata/sap/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/odata/sap/'));
            return `${root}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV`;
        }

        return url.replace('API_PURCHASEREQUISITION_PROCESS_SRV', 'API_MATERIAL_DOCUMENT_SRV');
    },



    postGoodsReceipt: async (config, data) => {
        let headers = getHeaders(config);

        // Construct API_MATERIAL_DOCUMENT_SRV URL
        let matDocUrl = config.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, '');
        if (matDocUrl.includes('/sap/opu/')) {
            const root = matDocUrl.substring(0, matDocUrl.indexOf('/sap/opu/'));
            // Default to V2 OData Service
            matDocUrl = `${root}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV`;
        } else {
            // Fallback/Try to replace known segments
            matDocUrl = matDocUrl.replace('API_PURCHASEREQUISITION_PROCESS_SRV', 'API_MATERIAL_DOCUMENT_SRV')
                .replace('purchaserequisition', 'API_MATERIAL_DOCUMENT_SRV');
        }

        let url = `${matDocUrl}/A_MaterialDocumentHeader`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        // Fetch from Service Root, ensuring we hit the right service
        const tokenUrl = getProxyUrl(`${matDocUrl}/`);

        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform POST
        console.log("POST GR URL:", url);
        console.log("POST GR PAYLOAD:", JSON.stringify(data, null, 2));

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Post GR: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Purchase Order Methods ---

    getPOUrl: (config) => {
        let url = config.baseUrl;
        // Clean replacement for standard S/4HANA Cloud paths to switch from any API to API_PURCHASEORDER_PROCESS_SRV (V2)
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV`;
        }
        return url;
    },

    fetchPOs: async (config, top = 20) => {
        const headers = getHeaders(config);
        const poBaseUrl = api.getPOUrl(config);
        let url = `${poBaseUrl}/A_PurchaseOrder?$top=${top}&$orderby=PurchaseOrder desc&$expand=to_PurchaseOrderItem`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch POs: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchPOItems: async (config, poNumber) => {
        const headers = getHeaders(config);
        const poBaseUrl = api.getPOUrl(config);
        let url = `${poBaseUrl}/A_PurchaseOrder('${poNumber}')/to_PurchaseOrderItem`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch PO Items for ${poNumber}: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    createPO: async (config, data) => {
        let headers = getHeaders(config);
        const poBaseUrl = api.getPOUrl(config);
        let url = `${poBaseUrl}/A_PurchaseOrder`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        // Fetch from Service Root
        const tokenUrl = getProxyUrl(`${poBaseUrl}/`);

        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform POST
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Create PO: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Product/Master Data Methods ---

    getProductUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_PRODUCT_SRV`;
        }
        // Fallback for flat URLs
        return url.replace(/API_.*_SRV/i, 'API_PRODUCT_SRV');
    },

    fetchStorageLocations: async (config, plant, material) => {
        const headers = getHeaders(config);
        const prodBaseUrl = api.getProductUrl(config);
        // Using A_ProductStorageLocation to find valid locations for this material/plant
        let url = `${prodBaseUrl}/A_ProductStorageLocation?$filter=Product eq '${material}' and Plant eq '${plant}'`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            // It's possible the product API isn't active or user lacks permission.
            // We shouldn't block the UI, just return empty.
            console.warn(`Failed to fetch storage locations: ${response.status}`);
            return { d: { results: [] } };
        }
        const json = await response.json();
        const results = json.d ? json.d.results : (json.value || []);
        console.log("Storage Locations Fetched:", results.length, results[0]);
        return json;
    },

    // Fetch all Plants for value help (using OData V4 API_PLANT_2)
    fetchPlantList: async (config) => {
        const headers = getHeaders(config);

        // Build the correct OData V4 URL for API_PLANT_2
        // Format: /sap/opu/odata4/sap/api_plant_2/srvd_a2x/sap/plant/0001/Plant
        let baseUrl = config.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, '');
        let plantUrl;
        if (baseUrl.includes('/sap/opu/')) {
            const root = baseUrl.substring(0, baseUrl.indexOf('/sap/opu/'));
            plantUrl = `${root}/sap/opu/odata4/sap/api_plant_2/srvd_a2x/sap/plant/0001/Plant`;
        } else {
            // Extract root from S/4HANA Cloud pattern
            const urlObj = new URL(baseUrl);
            plantUrl = `${urlObj.origin}/sap/opu/odata4/sap/api_plant_2/srvd_a2x/sap/plant/0001/Plant`;
        }

        let url = `${plantUrl}?$select=Plant,PlantName&$top=100`;
        url = getProxyUrl(url);

        console.log("Fetching Plants from API_PLANT_2 (OData V4):", url);

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                console.warn(`Failed to fetch plants: ${response.status}`);
                return { d: { results: [] } };
            }
            const json = await response.json();
            // OData V4 returns results in 'value' array
            const results = json.value || json.d?.results || [];

            // Sort alphabetically
            results.sort((a, b) => (a.Plant || '').localeCompare(b.Plant || ''));
            return { d: { results: results } };
        } catch (err) {
            console.warn("Error fetching plants:", err);
            return { d: { results: [] } };
        }
    },


    // Fetch Storage Locations for a specific Plant (using API_PRODUCT_SRV like GR for PO)
    fetchStorageLocationsByPlant: async (config, plant) => {
        const headers = getHeaders(config);
        const prodBaseUrl = api.getProductUrl(config);

        // Using A_ProductStorageLocation to find storage locations for this plant
        let url = `${prodBaseUrl}/A_ProductStorageLocation?$filter=Plant eq '${plant}'&$select=StorageLocation&$top=200`;
        url = getProxyUrl(url);

        console.log("Fetching Storage Locations for Plant:", plant, url);

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                console.warn(`Failed to fetch storage locations: ${response.status}`);
                return { d: { results: [] } };
            }
            const json = await response.json();
            const results = json.d ? json.d.results : (json.value || []);

            // Deduplicate storage locations
            const uniqueSLocs = [];
            const seen = new Set();
            for (const sl of results) {
                if (sl.StorageLocation && !seen.has(sl.StorageLocation)) {
                    seen.add(sl.StorageLocation);
                    uniqueSLocs.push({ StorageLocation: sl.StorageLocation, StorageLocationName: '' });
                }
            }
            // Sort alphabetically
            uniqueSLocs.sort((a, b) => a.StorageLocation.localeCompare(b.StorageLocation));
            console.log("Storage Locations Found:", uniqueSLocs.length);
            return { d: { results: uniqueSLocs } };
        } catch (err) {
            console.warn("Error fetching storage locations:", err);
            return { d: { results: [] } };
        }
    },


    fetchSuppliers: async (config, supplierIds) => {
        if (!supplierIds || supplierIds.length === 0) return {};

        try {
            const headers = getHeaders(config);
            // Construct Business Partner URL
            let bpBaseUrl = config.baseUrl;
            if (bpBaseUrl.includes('/sap/opu/')) {
                const root = bpBaseUrl.substring(0, bpBaseUrl.indexOf('/sap/opu/'));
                bpBaseUrl = `${root}/sap/opu/odata/sap/API_BUSINESS_PARTNER`;
            } else {
                bpBaseUrl = bpBaseUrl.replace(/API_.*_SRV/i, 'API_BUSINESS_PARTNER');
            }

            // Filter for specific suppliers
            // $filter=Supplier in ('1000', '2000') syntax might not be supported on all versions, using OR
            const filter = supplierIds.map(id => `Supplier eq '${id}'`).join(' or ');
            let url = `${bpBaseUrl}/A_Supplier?$filter=${encodeURIComponent(filter)}&$select=Supplier,SupplierName`;
            url = getProxyUrl(url);

            console.log("Fetching Suppliers URL:", url);
            const response = await fetch(url, { headers });

            if (!response.ok) {
                console.warn(`Failed to fetch suppliers: ${response.status}`);
                return {};
            }

            const json = await response.json();
            const results = json.d ? json.d.results : (json.value || []);

            // Map ID -> Name
            const map = {};
            results.forEach(s => {
                map[s.Supplier] = s.SupplierName;
            });
            return map;

        } catch (error) {
            console.warn("Error fetching suppliers:", error);
            return {};
        }
    },

    // --- Goods Issue / Outbound Delivery Methods ---

    getODUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV;v=0002`;
        }
        // Fallback replacement if using a generic base
        return url.replace(/API_.*_SRV/i, 'API_OUTBOUND_DELIVERY_SRV;v=0002');
    },

    fetchOutboundDeliveries: async (config, top = 20) => {
        const headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        // Filter for open deliveries? Usually OverallStat..Status is 'A' (Not processed) or 'B' (Partially). 
        // Assuming we want all for now or recently created.
        let url = `${odBaseUrl}/A_OutbDeliveryHeader?$top=${top}&$orderby=DeliveryDocument desc&$expand=to_DeliveryDocumentItem`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch ODs: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchOutboundDelivery: async (config, deliveryId) => {
        const headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        let url = `${odBaseUrl}/A_OutbDeliveryHeader('${deliveryId}')`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch OD ${deliveryId}: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchOutboundDeliveryItems: async (config, deliveryId) => {
        const headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        let url = `${odBaseUrl}/A_OutbDeliveryHeader('${deliveryId}')/to_DeliveryDocumentItem`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch OD Items: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    pickOutboundDeliveryItem: async (config, deliveryId, itemId, etag) => {
        let headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        // Function Import: /PickOneItem?DeliveryDocument='...'&DeliveryDocumentItem='...'
        // Note: Parameters must be single-quoted
        let url = `${odBaseUrl}/PickOneItem?DeliveryDocument='${deliveryId}'&DeliveryDocumentItem='${itemId}'`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${odBaseUrl}/`);
        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // Add If-Match header (required for locking/concurrency)
        if (etag) {
            headers['If-Match'] = etag;
        }

        // 2. Perform POST
        const response = await fetch(url, {
            method: 'POST',
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Pick Item: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    updateOutboundDeliveryItem: async (config, deliveryId, itemId, data, etag) => {
        let headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        // PATCH A_OutbDeliveryItem(DeliveryDocument='...',DeliveryDocumentItem='...')
        let url = `${odBaseUrl}/A_OutbDeliveryItem(DeliveryDocument='${deliveryId}',DeliveryDocumentItem='${itemId}')`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token (needed for modification)
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${odBaseUrl}/`);
        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // Add If-Match header (required for locking/concurrency)
        if (etag) {
            headers['If-Match'] = etag;
        }

        console.log("PATCH OD Item URL:", url);
        console.log("PATCH Payload:", data);

        // 2. Perform PATCH
        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Update OD Item: ${response.status} ${errorText}`);
        }
        // PATCH usually returns 204 No Content, so no JSON parsing if empty
        if (response.status === 204) return true;
        return response.json();
    },

    postGoodsIssueWithOD: async (config, deliveryId, etag) => {
        let headers = getHeaders(config);
        const odBaseUrl = api.getODUrl(config);
        let url = `${odBaseUrl}/PostGoodsIssue?DeliveryDocument='${deliveryId}'`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        // Fetch from Service Root
        const tokenUrl = getProxyUrl(`${odBaseUrl}/`);

        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // Add If-Match header if ETag is provided (required for 428 Precondition Required)
        if (etag) {
            headers['If-Match'] = etag;
        }

        // 2. Perform POST (Function Import uses POST)
        const response = await fetch(url, {
            method: 'POST',
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Post GI: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Physical Inventory Methods ---

    getPIUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_PHYSICAL_INVENTORY_DOC_SRV`;
        }
        return url.replace(/API_.*_SRV/i, 'API_PHYSICAL_INVENTORY_DOC_SRV');
    },

    fetchPIDocs: async (config, top = 20) => {
        const headers = getHeaders(config);
        const piBaseUrl = api.getPIUrl(config);
        // Removed expansion to avoid 404 if navigation property differs in specific version
        let url = `${piBaseUrl}/A_PhysInventoryDocHeader?$top=${top}&$orderby=PhysicalInventoryDocument desc`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch PIDs: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchPIItems: async (config, fiscalYear, piDoc) => {
        const headers = getHeaders(config);
        const piBaseUrl = api.getPIUrl(config);
        // Navigation 'to_PhysicalInventoryDocItem' failed with 404.
        // Fallback: Query Item entity set directly with filter
        let url = `${piBaseUrl}/A_PhysInventoryDocItem?$filter=FiscalYear eq '${fiscalYear}' and PhysicalInventoryDocument eq '${piDoc}'`;
        console.log("Fetching PI Items via Direct Query:", url);
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch PI Items: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    postPICount: async (config, fiscalYear, piDoc, piItem, quantity, unit, zeroCount = false) => {
        let headers = getHeaders(config);
        const piBaseUrl = api.getPIUrl(config);

        // Use PATCH to update the item with the count
        let url = `${piBaseUrl}/A_PhysInventoryDocItem(FiscalYear='${fiscalYear}',PhysicalInventoryDocument='${piDoc}',PhysicalInventoryDocumentItem='${piItem}')`;
        url = getProxyUrl(url);

        const payload = {
            QuantityInUnitOfEntry: zeroCount ? "0" : `${quantity}`,
            UnitOfEntry: unit
        };

        // 1. Fetch CSRF
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${piBaseUrl}/`);
        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        console.log("PATCH PI Count URL:", url);
        console.log("PATCH PI Payload:", payload);

        // 2. Perform PATCH
        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Post Count: ${response.status} ${errorText}`);
        }

        // PATCH usually returns 204 No Content
        if (response.status === 204) return true;
        return response.json();
    },

    // --- Stock Overview Methods ---

    getStockUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV`;
        }
        return url.replace(/API_.*_SRV/i, 'API_MATERIAL_STOCK_SRV');
    },

    fetchMaterialStock: async (config, materialId, plant) => {
        const headers = getHeaders(config);
        const stockBaseUrl = api.getStockUrl(config);

        // Filter by Material. If plant is known, use it too.
        // Using A_MatlStkInAcctMod (Material Stock in Account Model) to get general stock levels
        // Or A_MaterialStock if available. A_MatlStkInAcctMod is standard for stock overview.
        let query = `$filter=Material eq '${materialId}'`;
        if (plant) {
            query += ` and Plant eq '${plant}'`;
        }

        // We want specific fields: StorageLocation, Type, Quantity, etc.
        // Note: Stock Value might not be directly here; might need A_ValuatedStock or product price * qty.
        // A_MatlStkInAcctMod usually has: Plant, StorageLocation, Material, MatlWrhsStkQtyInMatlBaseUnit, InventoryStockType
        let url = `${stockBaseUrl}/A_MatlStkInAcctMod?${query}`;
        url = getProxyUrl(url);

        console.log("Fetching Stock for:", materialId, url);

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                // Try fallback if A_MatlStkInAcctMod doesn't exist?
                console.warn("A_MatlStkInAcctMod failed, trying generic A_MaterialStock or similar?");
                throw new Error(`Failed to fetch Stock: ${response.status} ${response.statusText}`);
            }
            const json = await response.json();
            // Enhance results with value estimation if possible (requires fetching standard price)
            return json;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
    ,

    // --- Inbound Delivery Methods ---

    getIBDUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_INBOUND_DELIVERY_SRV;v=0002`;
        }
        return url.replace(/API_.*_SRV/i, 'API_INBOUND_DELIVERY_SRV;v=0002');
    },

    fetchInboundDeliveries: async (config, top = 20) => {
        const headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        let url = `${ibdBaseUrl}/A_InbDeliveryHeader?$top=${top}&$orderby=DeliveryDocument desc&$expand=to_DeliveryDocumentItem`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch Inbound Deliveries: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    updateInboundDeliveryHeader: async (config, deliveryId, payload, etag) => {
        let headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        let url = `${ibdBaseUrl}/A_InbDeliveryHeader('${deliveryId}')`;
        url = getProxyUrl(url);

        if (etag) {
            headers['If-Match'] = etag;
        }

        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update IBD Header: ${response.status} ${errorText}`);
        }

        // Return 204 or body. If 204, return empty object.
        if (response.status === 204) return { success: true };
        return response.json(); // Some configs return 200 with data
    },

    fetchInboundDelivery: async (config, deliveryId) => {
        const headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        let url = `${ibdBaseUrl}/A_InbDeliveryHeader('${deliveryId}')`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch IBD Header: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchInboundDeliveryItems: async (config, deliveryId) => {
        const headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        // Expand Document Flow to get Putaway/Picking quantities
        let url = `${ibdBaseUrl}/A_InbDeliveryHeader('${deliveryId}')/to_DeliveryDocumentItem?$expand=to_DocumentFlow`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch IBD Items: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchInboundDeliveryItem: async (config, deliveryId, itemId) => {
        const headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        let url = `${ibdBaseUrl}/A_InbDeliveryItem(DeliveryDocument='${deliveryId}',DeliveryDocumentItem='${itemId}')`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch IBD Item: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    updateInboundDeliveryItem: async (config, deliveryId, itemId, data, etag) => {
        let headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        // PATCH A_InbDeliveryItem(DeliveryDocument='...',DeliveryDocumentItem='...')
        let url = `${ibdBaseUrl}/A_InbDeliveryItem(DeliveryDocument='${deliveryId}',DeliveryDocumentItem='${itemId}')`;
        url = getProxyUrl(url);

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${ibdBaseUrl}/`);
        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        if (etag) { // If-Match
            headers['If-Match'] = etag;
        }

        console.log("PATCH IBD Item URL:", url);
        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Update IBD Item: ${response.status} ${errorText}`);
        }

        const newEtag = response.headers.get('etag') || response.headers.get('ETag');

        if (response.status === 204) {
            return { success: true, etag: newEtag };
        }
        const json = await response.json();
        return { ...json, etag: newEtag };
    },

    putawayInboundDeliveryItem: async (config, deliveryId, itemId, etag) => {
        let headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);

        // Function Import: /PutawayOneItem?DeliveryDocument='...'&DeliveryDocumentItem='...'
        const url = getProxyUrl(`${ibdBaseUrl}/PutawayOneItem?DeliveryDocument='${deliveryId}'&DeliveryDocumentItem='${itemId}'`);

        // 1. Fetch CSRF Token
        try {
            const tokenUrl = getProxyUrl(`${ibdBaseUrl}/A_InbDeliveryHeader('${deliveryId}')`);
            const tokenResp = await fetch(tokenUrl, {
                method: 'HEAD',
                headers: { ...headers, 'X-CSRF-Token': 'Fetch' }
            });
            const token = tokenResp.headers.get('x-csrf-token');
            if (token) {
                headers['X-CSRF-Token'] = token;
            }
        } catch (e) {
            console.warn("Failed to fetch fresh CSRF token:", e);
        }

        // 2. Add If-Match (ETag) if provided (Required for 428 Precondition Required)
        if (etag) {
            headers['If-Match'] = etag;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Ignore "No change" errors if status is success-like
            if (response.status !== 204 && response.status !== 200) {
                console.warn("PutawayOneItem warning/error:", errorText);
                // Don't throw if it's just a warning or redundant call, but throw if real error?
                // For now, let's treat 4xx as error
                if (response.status >= 400) {
                    // Sometimes 412 is returned if ETag mismatch, but we handle that in caller.
                    throw new Error(`Putaway Action Failed: ${response.status}`);
                }
            }
        }
        return { success: true };
    },

    fetchInboundDeliveryDocFlow: async (config, deliveryId) => {
        const headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        let url = `${ibdBaseUrl}/A_InbDeliveryDocFlow?$filter=PrecedingDocument eq '${deliveryId}'`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            // It's possible DocFlow is not supported or returns error if empty?
            // Should be fine to return empty list if 404
            const txt = await response.text();
            console.warn("DocFlow fetch failed:", txt);
            return { d: { results: [] } };
        }
        return response.json();
    },

    fetchMaterialDocumentsForIBD: async (config, deliveryId) => {
        const headers = getHeaders(config);
        // Use API_MATERIAL_DOCUMENT_SRV
        // Assuming baseUrl points to standard root, we construct the service URL
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            url = `${root}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentItem`;
        } else {
            // Fallback/Local replace
            url = url.replace(/API_.*_SRV/i, 'API_MATERIAL_DOCUMENT_SRV') + '/A_MaterialDocumentItem';
        }

        url = `${url}?$filter=Delivery eq '${deliveryId}'`;
        url = getProxyUrl(url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            // If service not found or empty, return empty list gracefully?
            // But if specific error, throw
            const txt = await response.text();
            console.warn("Matches for MatDoc failed:", txt);
            return { d: { results: [] } };
        }
        return response.json();
    },


    postGoodsReceiptForIBD: async (config, deliveryId, etag, correctDate) => {
        let headers = getHeaders(config);
        const ibdBaseUrl = api.getIBDUrl(config);
        // Function Import: /PostGoodsReceipt?DeliveryDocument='...'
        let url = `${ibdBaseUrl}/PostGoodsReceipt?DeliveryDocument='${deliveryId}'`;

        // Append Date param if provided (for M7/053 fix)
        if (correctDate) {
            url += `&ActualGoodsMovementDate=datetime'${correctDate}'`;
        }

        url = getProxyUrl(url);

        // Add If-Match if etag is provided (Crucial for 428 errors)
        if (etag) {
            headers['If-Match'] = etag;
        }

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${ibdBaseUrl}/`);
        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform POST
        console.log("POST GR for IBD URL:", url);
        const response = await fetch(url, {
            method: 'POST',
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Post GR for IBD: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Stock Overview Methods ---

    fetchMaterialStock: async (config, filters) => {
        const headers = getHeaders(config);

        // Handle both old (string) and new (object) API
        let material = '', plant = '', storageLocation = '';
        if (typeof filters === 'string') {
            material = filters;
        } else {
            material = filters.material || '';
            plant = filters.plant || '';
            storageLocation = filters.storageLocation || '';
        }

        // Build the API_MATERIAL_STOCK_SRV URL
        let baseUrl = config.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, '');
        if (baseUrl.includes('/sap/opu/')) {
            const root = baseUrl.substring(0, baseUrl.indexOf('/sap/opu/'));
            baseUrl = `${root}/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV`;
        } else if (baseUrl.includes('api.s4hana.cloud.sap')) {
            // S/4HANA Cloud API
            baseUrl = baseUrl.replace(/\/API_.*_SRV/i, '/API_MATERIAL_STOCK_SRV');
        } else {
            baseUrl = baseUrl.replace('API_PURCHASEREQUISITION_PROCESS_SRV', 'API_MATERIAL_STOCK_SRV');
        }

        // Build filter conditions dynamically
        const filterParts = [];
        if (material) {
            filterParts.push(`substringof('${material}', Material)`);
        }
        if (plant) {
            filterParts.push(`Plant eq '${plant}'`);
        }
        if (storageLocation) {
            filterParts.push(`StorageLocation eq '${storageLocation}'`);
        }

        const filter = filterParts.length > 0 ? filterParts.join(' and ') : '';
        let url = `${baseUrl}/A_MatlStkInAcctMod?$top=100`;
        if (filter) {
            url += `&$filter=${encodeURIComponent(filter)}`;
        }
        url = getProxyUrl(url);

        console.log("Fetching Material Stock:", url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch Material Stock: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    // --- Reservation Document Methods (GI Against Reservation) ---

    getReservationUrl: (config) => {
        let url = config.baseUrl;
        if (url.includes('/sap/opu/')) {
            const root = url.substring(0, url.indexOf('/sap/opu/'));
            return `${root}/sap/opu/odata/sap/API_RESERVATION_DOCUMENT_SRV`;
        }
        return url.replace(/API_.*_SRV/i, 'API_RESERVATION_DOCUMENT_SRV');
    },

    fetchReservations: async (config, top = 30) => {
        const headers = getHeaders(config);
        const resBaseUrl = api.getReservationUrl(config);
        // Filter for open reservations (not deleted, not completely issued)
        // Note: GoodsMovementIsAllowed doesn't exist in this API version, so we fetch all and filter client-side if needed
        let url = `${resBaseUrl}/A_ReservationDocumentHeader?$top=${top}&$orderby=Reservation desc&$expand=to_ReservationDocumentItem`;
        url = getProxyUrl(url);

        console.log("Fetching Reservations:", url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch Reservations: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    fetchReservationItems: async (config, reservation) => {
        const headers = getHeaders(config);
        const resBaseUrl = api.getReservationUrl(config);
        // Query items for a specific reservation
        let url = `${resBaseUrl}/A_ReservationDocumentItem?$filter=Reservation eq '${reservation}'`;
        url = getProxyUrl(url);

        console.log("Fetching Reservation Items:", url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch Reservation Items: ${response.status} ${errorText}`);
        }
        return response.json();
    },

    /**
     * Post Goods Issue against Reservation via API_MATERIAL_DOCUMENT_SRV
     * @param {Object} config - API configuration
     * @param {Array} items - Array of items to post, each with:
     *   { Material, Plant, StorageLocation, QuantityInEntryUnit, EntryUnit, Reservation, ReservationItem, GoodsMovementType }
     * @returns {Promise<Object>} - Created Material Document response
     */
    postGoodsIssueForReservation: async (config, items) => {
        let headers = getHeaders(config);

        // Construct API_MATERIAL_DOCUMENT_SRV URL
        let matDocUrl = config.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, '');
        if (matDocUrl.includes('/sap/opu/')) {
            const root = matDocUrl.substring(0, matDocUrl.indexOf('/sap/opu/'));
            matDocUrl = `${root}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV`;
        } else {
            matDocUrl = matDocUrl.replace('API_PURCHASEREQUISITION_PROCESS_SRV', 'API_MATERIAL_DOCUMENT_SRV')
                .replace('purchaserequisition', 'API_MATERIAL_DOCUMENT_SRV');
        }

        let url = `${matDocUrl}/A_MaterialDocumentHeader`;
        url = getProxyUrl(url);

        // Create posting date in SAP OData format
        const now = new Date();
        const sapDate = `/Date(${now.getTime()})/`;

        // Build payload
        const payload = {
            PostingDate: sapDate,
            DocumentDate: sapDate,
            GoodsMovementCode: "03", // 03 = Goods Issue
            to_MaterialDocumentItem: items.map((item, idx) => ({
                MaterialDocumentItem: String((idx + 1) * 10).padStart(4, '0'), // 0010, 0020, etc.
                GoodsMovementType: item.GoodsMovementType || "261", // 261 = GI for Order/Reservation
                Material: item.Material,
                Plant: item.Plant,
                StorageLocation: item.StorageLocation,
                QuantityInEntryUnit: String(item.QuantityInEntryUnit),
                EntryUnit: item.EntryUnit || item.BaseUnit || "EA",
                Reservation: item.Reservation,
                ReservationItem: item.ReservationItem,
                ReservationIsFinallyIssued: item.IsFinalIssue || false
            }))
        };

        // 1. Fetch CSRF Token
        const tokenHeaders = { ...headers, 'X-CSRF-Token': 'Fetch' };
        const tokenUrl = getProxyUrl(`${matDocUrl}/`);

        const tokenResponse = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
        const csrfToken = tokenResponse.headers.get ?
            tokenResponse.headers.get('x-csrf-token') :
            (tokenResponse.headers['x-csrf-token'] || tokenResponse.headers['X-CSRF-Token']);

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        // 2. Perform POST
        console.log("POST GI for Reservation URL:", url);
        console.log("POST GI for Reservation PAYLOAD:", JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to Post GI for Reservation: ${response.status} ${errorText}`);
        }
        return response.json();
    }
};
