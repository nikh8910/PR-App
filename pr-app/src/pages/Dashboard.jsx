import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Search, Plus, Package, FileText, AlertCircle, Loader, X, ChevronDown, ChevronUp, AlertTriangle, ArrowLeft, Scan, Home, Calendar, ShoppingCart } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';

const Dashboard = () => {
    // Utility to clean up material numbers for display
    const stripLeadingZeros = (str) => str ? str.replace(/^0+/, '') : str;

    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorDetails, setErrorDetails] = useState(null); // { title: string, message: string }
    const [currentView, setCurrentView] = useState('list'); // 'list' | 'create' | 'items' | 'createPO'
    const [selectedPR, setSelectedPR] = useState(null); // The detailed PR object for Item View
    const [expandedPR, setExpandedPR] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null); // For Item Details
    const [activeScanField, setActiveScanField] = useState(null); // 'search' | 'material' | null
    const [converting, setConverting] = useState(false); // For PR to PO conversion
    const [referencePRNumber, setReferencePRNumber] = useState(''); // For Reference PR in Create view
    const [loadingReferencePR, setLoadingReferencePR] = useState(false);

    // Create PO state
    const [poReferencePR, setPoReferencePR] = useState('');
    const [loadingPOReference, setLoadingPOReference] = useState(false);
    const [newPO, setNewPO] = useState({
        Supplier: '',
        PurchasingOrganization: '1110',
        PurchasingGroup: '001',
        CompanyCode: '1110',
        DocumentCurrency: 'EUR',
        items: []
    });
    const [creatingPO, setCreatingPO] = useState(false);

    const [searchParams] = useSearchParams();

    // Handle URL query params (e.g., ?view=create or ?view=createPO)
    useEffect(() => {
        const viewParam = searchParams.get('view');
        if (viewParam === 'create') {
            setCurrentView('create');
        } else if (viewParam === 'createPO') {
            setCurrentView('createPO');
        }
    }, [searchParams]);

    // Scroll to selected PR when returning to list
    useEffect(() => {
        if (currentView === 'list' && selectedPR) {
            setTimeout(() => {
                const element = document.getElementById(`pr-card-${selectedPR.PurchaseRequisition}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [currentView, selectedPR]);

    // New PR Form State
    const [newPR, setNewPR] = useState({
        PurchaseRequisition: '', // Optional/internal
        PurchaseRequisitionType: 'NB',
        PurReqnDescription: '',
        _PurchaseRequisitionItem: [{
            PurchaseRequisitionItem: '00010',
            Material: '',
            PurchaseRequisitionItemText: 'Test PR Item',
            MaterialGroup: 'A001',
            RequestedQuantity: '1',
            BaseUnit: 'EA',
            FixedSupplier: '',
            DeliveryDate: '',
            PurchaseRequisitionPrice: '0.00',
            PurReqnItemCurrency: 'EUR',
            Plant: '1110',
            CompanyCode: '1110',
            AccountAssignmentCategory: 'U',
            PurchasingGroup: '001'
        }]
    });

    const handleAddItem = () => {
        const nextItemNum = (newPR._PurchaseRequisitionItem.length + 1) * 10;
        const newItem = {
            PurchaseRequisitionItem: nextItemNum.toString().padStart(5, '0'),
            Material: '',
            PurchaseRequisitionItemText: 'New Item',
            MaterialGroup: 'A001',
            RequestedQuantity: '1',
            BaseUnit: 'EA',
            FixedSupplier: '',
            DeliveryDate: '',
            PurchaseRequisitionPrice: '0.00',
            PurReqnItemCurrency: 'EUR',
            Plant: '1110',
            CompanyCode: '1110',
            AccountAssignmentCategory: 'U',
            PurchasingGroup: '001'
        };
        setNewPR({ ...newPR, _PurchaseRequisitionItem: [...newPR._PurchaseRequisitionItem, newItem] });
    };

    const handleRemoveItem = (index) => {
        if (newPR._PurchaseRequisitionItem.length === 1) return;
        const updatedItems = newPR._PurchaseRequisitionItem.filter((_, i) => i !== index);
        setNewPR({ ...newPR, _PurchaseRequisitionItem: updatedItems });
    };

    const handleScanResult = (decodedText) => {
        if (activeScanField === 'search') {
            setSearchTerm(decodedText);
            setActiveScanField(null);
        } else if (activeScanField && activeScanField.startsWith('material-')) {
            const index = parseInt(activeScanField.split('-')[1]);
            const items = [...newPR._PurchaseRequisitionItem];
            if (items[index]) {
                items[index].Material = decodedText;
                items[index].PurchaseRequisitionItemText = "";
                items[index].MaterialGroup = "";
                setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
            }
            setActiveScanField(null);
        } else if (activeScanField === 'newItemMaterial') {
            setNewItemForPR({ ...newItemForPR, Material: decodedText, PurchaseRequisitionItemText: '', MaterialGroup: '' });
            setActiveScanField(null);
        }
    };

    const handleFetch = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        setErrorDetails(null);
        setPrs([]);
        try {
            let data;
            if (searchTerm.trim()) {
                // Use Search/Filter now instead of direct Key access
                data = await api.searchPRs(apiConfig, searchTerm.trim());
            } else {
                data = await api.fetchPRs(apiConfig);
            }

            if (data && data.value) {
                setPrs(data.value);
            } else if (data && !data.value && data.PurchaseRequisition) {
                setPrs([data]);
            } else {
                setPrs([]);
            }
        } catch (err) {
            setErrorDetails({
                title: "Failed to Fetch Data",
                message: err.message
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorDetails(null);
        try {
            // Prepare payload
            // Note: If PurchaseRequisition is empty string, we usually omit it or send it as is if API supports it for auto-numbering.
            // S/4HANA usually expects the property to be present but empty for internal number assignment, 
            // or strictly omitted depending on version. We will send "" for now.
            const payload = {
                ...newPR,
                _PurchaseRequisitionItem: newPR._PurchaseRequisitionItem.map(item => {
                    const cleanItem = {
                        ...item,
                        RequestedQuantity: parseFloat(item.RequestedQuantity) || 1,
                        BaseUnitISOCode: (item.BaseUnit || 'EA').toUpperCase(), // Map input to ISO Code for API
                        CompanyCode: item.CompanyCode || '1110',
                        AccountAssignmentCategory: item.AccountAssignmentCategory || 'U'
                    };
                    delete cleanItem.BaseUnit; // Remove internal unit

                    // Clean up Optional Fields
                    if (!cleanItem.FixedSupplier) delete cleanItem.FixedSupplier;
                    if (!cleanItem.DeliveryDate) delete cleanItem.DeliveryDate;

                    // Fix for "Invalid Value '0.00'" error
                    // If price is 0, remove it from payload so SAP handles valuation automatically
                    if (!cleanItem.PurchaseRequisitionPrice || parseFloat(cleanItem.PurchaseRequisitionPrice) === 0) {
                        delete cleanItem.PurchaseRequisitionPrice;
                        // Also remove currency if no price is provided to avoid mismatch
                        delete cleanItem.PurReqnItemCurrency;
                    }

                    // If Material is provided, let SAP derive details from Master Data
                    // However, BaseUnitISOCode IS REQUIRED by the API whenever RequestedQuantity is present, even for Materials.
                    if (cleanItem.Material) {
                        delete cleanItem.MaterialGroup;
                        delete cleanItem.PurchaseRequisitionItemText;

                        // SAP often requires 18-digit Material Numbers (padded with zeros)
                        // If the user enters "666", it might need to be "000000000000000666"
                        if (/^\d+$/.test(cleanItem.Material) && cleanItem.Material.length < 18) {
                            cleanItem.Material = cleanItem.Material.padStart(18, '0');
                        }
                    }

                    return cleanItem;
                })
            };

            // If ID is empty, maybe OData expects it to be omitted? 
            // Safe bet for standard OData create is to omit the key if server-generated.
            if (!payload.PurchaseRequisition) {
                delete payload.PurchaseRequisition;
            }

            const result = await api.createPR(apiConfig, payload);
            alert(`Purchase Requisition ${result.PurchaseRequisition || ''} Created Successfully!`);
            setCurrentView('list');
            // Reset form
            setNewPR({
                PurchaseRequisition: '',
                PurchaseRequisitionType: 'NB',
                PurReqnDescription: '',
                _PurchaseRequisitionItem: [{
                    PurchaseRequisitionItem: '00010',
                    Material: '',
                    PurchaseRequisitionItemText: 'Test PR Item',
                    MaterialGroup: 'A001',
                    RequestedQuantity: '1',
                    BaseUnit: 'EA',
                    FixedSupplier: '',
                    DeliveryDate: '',
                    PurchaseRequisitionPrice: '0.00',
                    PurReqnItemCurrency: 'EUR',
                    Plant: '1110',
                    CompanyCode: '1110',
                    AccountAssignmentCategory: 'U',
                    PurchasingGroup: '001'
                }]
            });
            handleFetch(); // Refresh list
        } catch (err) {
            let title = "Creation Failed";
            let message = err.message;

            // Smart Error Handling
            if (message.includes("M3/305") || message.includes("does not exist") || message.includes("not activated")) {
                title = "Invalid Material ID";
                message = "The Material Number you entered does not exist in the SAP system. Please use a valid ID (e.g., TG11) or leave the field empty to create a Text Item.";
            }

            setErrorDetails({
                title,
                message
            });
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id) => {
        setExpandedPR(expandedPR === id ? null : id);
    };

    const handleViewItems = (pr) => {
        setSelectedPR(pr);
        setIsAddingItem(false);
        setCurrentView('items');
    };

    const toggleItemExpand = (itemId) => {
        setExpandedItem(expandedItem === itemId ? null : itemId);
    };

    // Add Item to Existing PR State
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemForPR, setNewItemForPR] = useState({
        PurchaseRequisitionItem: '',
        Material: '',
        PurchaseRequisitionItemText: 'New Position',
        MaterialGroup: 'A001',
        RequestedQuantity: '1',
        BaseUnit: 'EA',
        FixedSupplier: '',
        DeliveryDate: '',
        PurchaseRequisitionPrice: '0.00',
        PurReqnItemCurrency: 'EUR',
        Plant: '1110',
        CompanyCode: '1110',
        AccountAssignmentCategory: 'U',
        PurchasingGroup: '001'
    });

    const handleAddItemSubmit = async () => {
        setLoading(true);
        setErrorDetails(null);
        try {
            const cleanItem = {
                ...newItemForPR,
                RequestedQuantity: parseFloat(newItemForPR.RequestedQuantity) || 1,
                BaseUnitISOCode: (newItemForPR.BaseUnit || 'EA').toUpperCase(),
                CompanyCode: newItemForPR.CompanyCode || '1110',
                AccountAssignmentCategory: newItemForPR.AccountAssignmentCategory || 'U'
            };
            delete cleanItem.BaseUnit;
            // Let SAP assign item number usually
            delete cleanItem.PurchaseRequisitionItem;

            if (!cleanItem.FixedSupplier) delete cleanItem.FixedSupplier;
            if (!cleanItem.DeliveryDate) delete cleanItem.DeliveryDate;
            if (!cleanItem.PurchaseRequisitionPrice || parseFloat(cleanItem.PurchaseRequisitionPrice) === 0) {
                delete cleanItem.PurchaseRequisitionPrice;
                delete cleanItem.PurReqnItemCurrency;
            }

            if (cleanItem.Material) {
                delete cleanItem.MaterialGroup;
                delete cleanItem.PurchaseRequisitionItemText;
                if (/^\d+$/.test(cleanItem.Material) && cleanItem.Material.length < 18) {
                    cleanItem.Material = cleanItem.Material.padStart(18, '0');
                }
            }

            await api.addItemToPR(apiConfig, selectedPR.PurchaseRequisition, cleanItem);
            alert('Item added successfully!');
            setIsAddingItem(false);

            // Refresh detailed PR
            const updatedPR = await api.fetchPR(apiConfig, selectedPR.PurchaseRequisition);
            setSelectedPR(updatedPR);

            // Update local list state so "Back" button shows correct count immediately
            setPrs(prevPrs => prevPrs.map(pr =>
                pr.PurchaseRequisition === updatedPR.PurchaseRequisition ? updatedPR : pr
            ));

            // Reset form
            setNewItemForPR({
                ...newItemForPR,
                Material: '',
                PurchaseRequisitionItemText: 'New Position',
                PurchaseRequisitionPrice: '0.00',
                FixedSupplier: '',
                DeliveryDate: ''
            });

        } catch (err) {
            let title = "Add Item Failed";
            let message = err.message;
            if (message.includes("does not exist")) {
                title = "Invalid Material";
                message = "Material ID does not exist.";
            }
            setErrorDetails({ title, message });
        } finally {
            setLoading(false);
        }
    };

    // Convert PR to PO
    const handleConvertToPO = async () => {
        if (!selectedPR || !selectedPR._PurchaseRequisitionItem?.length) {
            setErrorDetails({ title: 'Cannot Create PO', message: 'No items found in this PR.' });
            return;
        }

        const confirmConvert = window.confirm(`Create a Purchase Order from PR ${selectedPR.PurchaseRequisition}?`);
        if (!confirmConvert) return;

        setConverting(true);
        try {
            // Map PR items to PO item format
            const poItems = selectedPR._PurchaseRequisitionItem
                .filter(item => parseFloat(item.RequestedQuantity) > 0)
                .map((item, index) => {
                    const poItem = {
                        PurchaseOrderItem: ((index + 1) * 10).toString().padStart(5, '0'),
                        Plant: item.Plant || '1110',
                        OrderQuantity: item.RequestedQuantity?.toString() || '1',
                        PurchaseOrderQuantityUnit: item.BaseUnit || 'EA',
                        NetPriceAmount: item.PurchaseRequisitionPrice || '0.00',
                        DocumentCurrency: item.PurReqnItemCurrency || 'EUR',
                        PurchasingGroup: item.PurchasingGroup || '001',
                        PurchaseRequisition: selectedPR.PurchaseRequisition,
                        PurchaseRequisitionItem: item.PurchaseRequisitionItem
                    };

                    // Add material or text item fields
                    if (item.Material) {
                        poItem.Material = item.Material.padStart(18, '0');
                    } else {
                        poItem.PurchaseOrderItemText = item.PurchaseRequisitionItemText || 'Text Item';
                        poItem.MaterialGroup = item.MaterialGroup || 'A001';
                    }

                    return poItem;
                });

            // Build PO payload
            const poPayload = {
                CompanyCode: selectedPR._PurchaseRequisitionItem[0]?.CompanyCode || '1110',
                PurchaseOrderType: 'NB',
                Supplier: selectedPR._PurchaseRequisitionItem[0]?.FixedSupplier || '',
                PurchasingOrganization: '1110',
                PurchasingGroup: selectedPR._PurchaseRequisitionItem[0]?.PurchasingGroup || '001',
                DocumentCurrency: selectedPR._PurchaseRequisitionItem[0]?.PurReqnItemCurrency || 'EUR',
                to_PurchaseOrderItem: poItems
            };

            // If no supplier, prompt user
            if (!poPayload.Supplier) {
                const supplier = prompt('Enter Supplier/Vendor ID (required for PO):');
                if (!supplier) {
                    setConverting(false);
                    return;
                }
                poPayload.Supplier = supplier.padStart(10, '0');
            }

            console.log('Creating PO with payload:', JSON.stringify(poPayload, null, 2));

            const result = await api.createPO(apiConfig, poPayload);
            const poNumber = result?.d?.PurchaseOrder || 'Unknown';

            alert(`Purchase Order ${poNumber} created successfully from PR ${selectedPR.PurchaseRequisition}!`);
            setCurrentView('list');
        } catch (err) {
            console.error('Convert to PO failed:', err);
            setErrorDetails({ title: 'PO Creation Failed', message: err.message });
        } finally {
            setConverting(false);
        }
    };

    // Load Reference PR to prepopulate Create form
    const handleLoadReferencePR = async () => {
        if (!referencePRNumber.trim()) {
            setErrorDetails({ title: 'Reference PR', message: 'Please enter a PR number.' });
            return;
        }

        setLoadingReferencePR(true);
        try {
            const refPR = await api.fetchPR(apiConfig, referencePRNumber.trim());

            if (!refPR || !refPR._PurchaseRequisitionItem?.length) {
                setErrorDetails({ title: 'Reference PR', message: 'PR not found or has no items.' });
                return;
            }

            // Copy header and item fields
            setNewPR({
                ...newPR,
                PurchaseRequisitionType: refPR.PurchaseRequisitionType || 'NB',
                PurReqnDescription: refPR.PurReqnDescription || '',
                _PurchaseRequisitionItem: refPR._PurchaseRequisitionItem.map((item, index) => ({
                    PurchaseRequisitionItem: ((index + 1) * 10).toString().padStart(5, '0'),
                    Material: item.Material || '',
                    PurchaseRequisitionItemText: item.PurchaseRequisitionItemText || '',
                    MaterialGroup: item.MaterialGroup || 'A001',
                    RequestedQuantity: item.RequestedQuantity || '1',
                    BaseUnit: item.BaseUnit || 'EA',
                    FixedSupplier: item.FixedSupplier || '',
                    DeliveryDate: item.DeliveryDate || '',
                    PurchaseRequisitionPrice: item.PurchaseRequisitionPrice || '0.00',
                    PurReqnItemCurrency: item.PurReqnItemCurrency || 'EUR',
                    Plant: item.Plant || '1110',
                    CompanyCode: item.CompanyCode || '1110',
                    AccountAssignmentCategory: item.AccountAssignmentCategory || 'U',
                    PurchasingGroup: item.PurchasingGroup || '001'
                }))
            });

            setReferencePRNumber('');
            alert(`Loaded ${refPR._PurchaseRequisitionItem.length} items from PR ${referencePRNumber}. You can now edit and add more items.`);
        } catch (err) {
            console.error('Load Reference PR failed:', err);
            setErrorDetails({ title: 'Load Failed', message: err.message });
        } finally {
            setLoadingReferencePR(false);
        }
    };

    // Load PR to create PO from
    const handleLoadPOReference = async () => {
        if (!poReferencePR.trim()) {
            setErrorDetails({ title: 'Reference PR', message: 'Please enter a PR number.' });
            return;
        }

        setLoadingPOReference(true);
        try {
            const refPR = await api.fetchPR(apiConfig, poReferencePR.trim());

            if (!refPR || !refPR._PurchaseRequisitionItem?.length) {
                setErrorDetails({ title: 'Reference PR', message: 'PR not found or has no items.' });
                return;
            }

            // Map PR items to PO items
            const poItems = refPR._PurchaseRequisitionItem
                .filter(item => parseFloat(item.RequestedQuantity) > 0)
                .map((item, index) => ({
                    PurchaseOrderItem: ((index + 1) * 10).toString().padStart(5, '0'),
                    Material: item.Material || '',
                    PurchaseOrderItemText: item.PurchaseRequisitionItemText || '',
                    Plant: item.Plant || '1110',
                    OrderQuantity: item.RequestedQuantity || '1',
                    PurchaseOrderQuantityUnit: item.BaseUnit || 'EA',
                    NetPriceAmount: item.PurchaseRequisitionPrice || '0.00',
                    PurchasingGroup: item.PurchasingGroup || '001',
                    MaterialGroup: item.MaterialGroup || 'A001',
                    PurchaseRequisition: poReferencePR.trim(),
                    PurchaseRequisitionItem: item.PurchaseRequisitionItem
                }));

            setNewPO({
                Supplier: refPR._PurchaseRequisitionItem[0]?.FixedSupplier || '',
                PurchasingOrganization: '1110',
                PurchasingGroup: refPR._PurchaseRequisitionItem[0]?.PurchasingGroup || '001',
                CompanyCode: refPR._PurchaseRequisitionItem[0]?.CompanyCode || '1110',
                DocumentCurrency: refPR._PurchaseRequisitionItem[0]?.PurReqnItemCurrency || 'EUR',
                items: poItems
            });

        } catch (err) {
            console.error('Load PR for PO failed:', err);
            setErrorDetails({ title: 'Load Failed', message: err.message });
        } finally {
            setLoadingPOReference(false);
        }
    };

    // Submit PO creation
    const handleSubmitPO = async (e) => {
        e.preventDefault();

        if (!newPO.Supplier.trim()) {
            setErrorDetails({ title: 'Missing Supplier', message: 'Please enter a Supplier/Vendor ID.' });
            return;
        }

        if (!newPO.items.length) {
            setErrorDetails({ title: 'No Items', message: 'Please load a PR first to get items.' });
            return;
        }

        setCreatingPO(true);
        try {
            const poPayload = {
                CompanyCode: newPO.CompanyCode,
                PurchaseOrderType: 'NB',
                Supplier: newPO.Supplier.padStart(10, '0'),
                PurchasingOrganization: newPO.PurchasingOrganization,
                PurchasingGroup: newPO.PurchasingGroup,
                DocumentCurrency: newPO.DocumentCurrency,
                to_PurchaseOrderItem: newPO.items.map(item => {
                    const poItem = {
                        PurchaseOrderItem: item.PurchaseOrderItem,
                        Plant: item.Plant,
                        OrderQuantity: item.OrderQuantity,
                        PurchaseOrderQuantityUnit: item.PurchaseOrderQuantityUnit,
                        NetPriceAmount: item.NetPriceAmount,
                        DocumentCurrency: newPO.DocumentCurrency,
                        PurchasingGroup: item.PurchasingGroup,
                    };

                    if (item.Material) {
                        poItem.Material = item.Material.padStart(18, '0');
                    } else {
                        poItem.PurchaseOrderItemText = item.PurchaseOrderItemText || 'Text Item';
                        poItem.MaterialGroup = item.MaterialGroup || 'A001';
                    }

                    if (item.PurchaseRequisition) {
                        poItem.PurchaseRequisition = item.PurchaseRequisition;
                        poItem.PurchaseRequisitionItem = item.PurchaseRequisitionItem;
                    }

                    return poItem;
                })
            };

            console.log('Creating PO with payload:', JSON.stringify(poPayload, null, 2));

            const result = await api.createPO(apiConfig, poPayload);
            const poNumber = result?.d?.PurchaseOrder || 'Unknown';

            alert(`Purchase Order ${poNumber} created successfully!`);

            // Reset form and go back to list
            setNewPO({
                Supplier: '',
                PurchasingOrganization: '1110',
                PurchasingGroup: '001',
                CompanyCode: '1110',
                DocumentCurrency: 'EUR',
                items: []
            });
            setPoReferencePR('');
            setCurrentView('list');
            navigate('/pr');
        } catch (err) {
            console.error('Create PO failed:', err);
            setErrorDetails({ title: 'PO Creation Failed', message: err.message });
        } finally {
            setCreatingPO(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Fixed Header */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex justify-between items-start mb-6">
                    <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                        <Home size={20} />
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                    <h1 className="text-3xl font-bold text-white mb-1">
                        {prs.length}
                        <span className="text-lg text-blue-200">/{prs.length}</span>
                    </h1>
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">Purchase Requisitions</p>
                </div>

                {/* Search Bar - Centered like GR */}
                <div className="relative mt-4">
                    <input
                        type="text"
                        placeholder="Enter Document Number"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-blue-400 text-center font-medium"
                    />
                </div>
            </header>

            {/* Main Scrollable Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 -mt-2 z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {/* Error Toast / Banner */}
                    {errorDetails && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-4 animate-in shadow-sm">
                            <AlertTriangle className="text-red-500 shrink-0 mt-1" />
                            <div className="flex-1">
                                <h4 className="text-red-700 text-sm font-bold m-0 mb-1">{errorDetails.title}</h4>
                                <p className="text-red-600 text-xs m-0 break-all opacity-90 font-mono">{errorDetails.message}</p>
                            </div>
                            <button onClick={() => setErrorDetails(null)}><X size={16} className="text-red-400 hover:text-red-600" /></button>
                        </div>
                    )}

                    {/* LIST VIEW */}
                    {currentView === 'list' && (
                        <>
                            {/* Tabs and Actions */}
                            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar mb-4">
                                <button className="flex-none flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-slate-700 text-sm font-bold min-w-[140px] justify-center">
                                    <FileText size={16} className="text-blue-600" /> Requisitions
                                </button>
                                <button
                                    onClick={() => setCurrentView('create')}
                                    style={{ backgroundColor: '#0ea5e9' }}
                                    className="flex-none flex items-center gap-2 px-4 py-2 rounded-full shadow-sm text-white text-sm font-bold min-w-[100px] justify-center hover:opacity-90 transition-all"
                                >
                                    <Plus size={16} /> Create New
                                </button>
                                <button
                                    onClick={handleFetch}
                                    style={{ backgroundColor: '#0ea5e9' }}
                                    className="flex-none flex items-center gap-2 px-4 py-2 rounded-full shadow-sm text-white text-sm font-bold min-w-[100px] justify-center hover:opacity-90 transition-all disabled:opacity-50"
                                    disabled={loading}
                                >
                                    {loading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />} Search
                                </button>
                            </div>

                            {/* List */}
                            <div className="grid grid-cols-1 gap-4">
                                {prs.length === 0 && !loading && !errorDetails && (
                                    <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                        <Package size={48} className="mx-auto mb-4 opacity-30 text-slate-400" />
                                        <p className="font-medium text-slate-600">No Requisitions found.</p>
                                        <p className="text-xs text-slate-400 mt-1">Enter a search term or click Search to view recent items.</p>
                                    </div>
                                )}

                                {prs.map(pr => (
                                    <div
                                        key={pr.PurchaseRequisition}
                                        onClick={() => handleViewItems(pr)}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                    >
                                        {/* Left Colored Strip - Blue for PR */}
                                        <div className="w-2 bg-blue-500 flex-shrink-0"></div>

                                        {/* Main Content */}
                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <h3 className="text-lg font-bold text-blue-950 leading-tight">#{pr.PurchaseRequisition}</h3>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                    <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Description</span>
                                                    <span className="font-bold truncate" title={pr.PurReqnDescription}>
                                                        {pr.PurReqnDescription || 'No Description'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                    <Calendar size={13} className="text-slate-400" />
                                                    <span>{pr._PurchaseRequisitionItem?.[0]?.PurReqCreationDate || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Item Count Box */}
                                        <div className="pr-4 flex items-center justify-center pl-2">
                                            <div className="bg-blue-50 rounded-lg w-16 h-16 flex flex-col items-center justify-center border border-blue-100">
                                                <span className="text-[10px] uppercase font-bold text-blue-400 leading-none mb-1">Items</span>
                                                <span className="text-2xl font-black text-blue-500 leading-none">
                                                    {pr._PurchaseRequisitionItem?.length || 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ITEMS VIEW */}
                    {currentView === 'items' && selectedPR && (
                        <div className="animate-in slide-in-from-right-4">
                            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                                <button onClick={() => setCurrentView('list')} style={{ backgroundColor: '#0ea5e9' }} className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleConvertToPO}
                                        disabled={converting}
                                        style={{ backgroundColor: '#10b981' }}
                                        className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {converting ? <Loader size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                                        {converting ? 'Creating...' : 'Create PO'}
                                    </button>
                                    <button
                                        onClick={() => setIsAddingItem(!isAddingItem)}
                                        style={{ backgroundColor: isAddingItem ? '#94a3b8' : '#0ea5e9' }}
                                        className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        {isAddingItem ? <X size={16} /> : <Plus size={16} />}
                                        {isAddingItem ? 'Cancel' : 'Add Item'}
                                    </button>
                                </div>
                            </div>

                            {isAddingItem && (
                                <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 border-l-4 border-l-blue-500 animate-in slide-in-from-top-4 p-4">
                                    <h3 className="text-sm uppercase text-slate-400 font-bold mb-4 tracking-wider border-b border-slate-100 pb-2">New Item Details</h3>

                                    <div className="space-y-4">
                                        {/* Material Number - Full Width */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Material Number</label>
                                            <div className="flex gap-2">
                                                <input
                                                    value={newItemForPR.Material}
                                                    onChange={e => setNewItemForPR({ ...newItemForPR, Material: e.target.value })}
                                                    placeholder="e.g. TG11"
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full flex-1 h-10 px-3 transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    className="p-2.5 bg-white text-blue-600 border border-slate-300 rounded-lg hover:bg-blue-50 shadow-sm transition-colors flex-shrink-0"
                                                    onClick={() => setActiveScanField('newItemMaterial')}
                                                >
                                                    <Scan size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Two Column Row - Plant & Purchasing Grp */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Plant</label>
                                                <input
                                                    value={newItemForPR.Plant}
                                                    onChange={e => setNewItemForPR({ ...newItemForPR, Plant: e.target.value })}
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Purchasing Grp</label>
                                                <input
                                                    value={newItemForPR.PurchasingGroup}
                                                    onChange={e => setNewItemForPR({ ...newItemForPR, PurchasingGroup: e.target.value })}
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Description - Full Width */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Description</label>
                                            <input
                                                value={newItemForPR.PurchaseRequisitionItemText}
                                                onChange={e => setNewItemForPR({ ...newItemForPR, PurchaseRequisitionItemText: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>

                                        {/* Quantity - Full Width */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Quantity</label>
                                            <input
                                                type="number"
                                                value={newItemForPR.RequestedQuantity}
                                                onChange={e => setNewItemForPR({ ...newItemForPR, RequestedQuantity: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>

                                        {/* Two Column Row - Unit & Delivery Date */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Unit (ISO)</label>
                                                <input
                                                    value={newItemForPR.BaseUnit}
                                                    onChange={e => setNewItemForPR({ ...newItemForPR, BaseUnit: e.target.value })}
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Delivery Date</label>
                                                <input
                                                    type="date"
                                                    value={newItemForPR.DeliveryDate}
                                                    onChange={e => setNewItemForPR({ ...newItemForPR, DeliveryDate: e.target.value })}
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end mt-6">
                                        <button type="button" onClick={handleAddItemSubmit} style={{ backgroundColor: '#0ea5e9' }} className="px-6 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95">
                                            Confirm Add Item
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4">
                                {selectedPR._PurchaseRequisitionItem?.map(item => (
                                    <div key={item.PurchaseRequisitionItem} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
                                        <div
                                            className="p-5 cursor-pointer flex justify-between items-center hover:bg-slate-50 transition-colors"
                                            onClick={() => toggleItemExpand(item.PurchaseRequisitionItem)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center font-mono text-xs font-bold text-blue-600 border border-blue-100">
                                                    {item.PurchaseRequisitionItem}
                                                </div>
                                                <div>
                                                    <h4 className="m-0 text-base font-bold text-slate-800">
                                                        {item.Material ? stripLeadingZeros(item.Material) : (item.PurchaseRequisitionItemText || 'Text Item')}
                                                    </h4>
                                                    <p className="m-0 text-sm text-slate-500 mt-0.5">
                                                        {item.Material ? (item.PurchaseRequisitionItemText || 'Material') : 'Material Not Required'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex items-baseline justify-end gap-1">
                                                    <span className="text-slate-400 text-xs font-bold uppercase mr-1">Qty</span>
                                                    <span className="font-bold text-slate-800 text-lg">{item.RequestedQuantity}</span>
                                                    <span className="text-slate-500 text-xs font-bold">{item.BaseUnit}</span>
                                                </div>
                                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Requested</span>
                                            </div>
                                        </div>

                                        {/* Item Details Expansion */}
                                        {expandedItem === item.PurchaseRequisitionItem && (
                                            <div className="bg-slate-50/80 border-t border-slate-200 p-4 animate-in">
                                                {/* Item Description - Full Width */}
                                                <div className="mb-4 pb-3 border-b border-slate-200">
                                                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Item Description</span>
                                                    <span className="block text-sm font-medium text-slate-800">{item.PurchaseRequisitionItemText || '—'}</span>
                                                </div>

                                                {/* Details Grid - Always 2 columns with proper spacing */}
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Plant</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.Plant || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Storage Loc</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.StorageLocation || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Purchasing Grp</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.PurchasingGroup || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Material Grp</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.MaterialGroup || '—'}</span>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-200 my-3"></div>

                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Supplier</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.FixedSupplier || item.Supplier || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Delivery Date</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.DeliveryDate || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unit Price</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.PurchaseRequisitionPrice || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Currency</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.PurReqnItemCurrency || '—'}</span>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-200 my-3"></div>

                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Acct Category</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.AccountAssignmentCategory || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Requisitioner</span>
                                                        <span className="block text-sm font-semibold text-slate-800 truncate">{item.CreatedByUser || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Created On</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.PurReqCreationDate || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Item Status</span>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.ProcessingStatus || '—'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {(!selectedPR._PurchaseRequisitionItem || selectedPR._PurchaseRequisitionItem.length === 0) && (
                                    <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                        No items found in this requisition.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* CREATE VIEW */}
                    {currentView === 'create' && (
                        <div className="animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <div>
                                    <h2 className="m-0 text-xl font-bold text-slate-800">New Purchase Requisition</h2>
                                    <p className="text-sm text-slate-500 m-0 mt-1">Create a new internal request for materials or services</p>
                                </div>
                                <button onClick={() => { setErrorDetails(null); setCurrentView('list'); }} className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 font-medium bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg">
                                    <X size={18} /> Cancel
                                </button>
                            </div>

                            {/* Reference PR Section */}
                            <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                                    <div className="flex-1 w-full sm:w-auto">
                                        <label className="block text-xs font-bold text-amber-700 mb-1.5 uppercase">Reference PR (Optional)</label>
                                        <input
                                            type="text"
                                            value={referencePRNumber}
                                            onChange={e => setReferencePRNumber(e.target.value)}
                                            placeholder="Enter existing PR number to copy"
                                            className="bg-white border border-amber-300 text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 rounded-lg w-full h-10 px-3 transition-all"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleLoadReferencePR}
                                        disabled={loadingReferencePR || !referencePRNumber.trim()}
                                        style={{ backgroundColor: '#f59e0b' }}
                                        className="px-4 py-2 h-10 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {loadingReferencePR ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
                                        {loadingReferencePR ? 'Loading...' : 'Load PR'}
                                    </button>
                                </div>
                                <p className="text-xs text-amber-600 mt-2">Load data from an existing PR to quickly create a similar requisition</p>
                            </div>

                            <form onSubmit={handleCreateSubmit}>
                                <div className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                                    <h3 className="text-sm uppercase text-slate-400 font-bold mb-6 tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <FileText size={16} className="text-blue-500" /> Header Data
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">PR Number (Optional)</label>
                                            <input
                                                value={newPR.PurchaseRequisition}
                                                onChange={e => setNewPR({ ...newPR, PurchaseRequisition: e.target.value })}
                                                placeholder="Leave empty for auto"
                                                className="bg-white border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full transition-all"
                                            />
                                            <span className="text-[10px] text-slate-400 mt-1 block">Internal numbering if empty</span>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Doc Type</label>
                                            <input
                                                value={newPR.PurchaseRequisitionType}
                                                onChange={e => setNewPR({ ...newPR, PurchaseRequisitionType: e.target.value })}
                                                required
                                                className="bg-white border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full transition-all"
                                            />
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Description</label>
                                            <input
                                                value={newPR.PurReqnDescription}
                                                onChange={e => setNewPR({ ...newPR, PurReqnDescription: e.target.value })}
                                                required
                                                className="bg-white border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {newPR._PurchaseRequisitionItem.map((item, index) => (
                                    <div key={index} className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200 relative group border-l-4 border-l-blue-500">
                                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2">
                                            <h3 className="text-sm uppercase text-slate-400 font-bold tracking-wider flex items-center gap-2">
                                                <Package size={16} className="text-blue-500" /> Line Item {item.PurchaseRequisitionItem}
                                            </h3>
                                            {newPR._PurchaseRequisitionItem.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(index)}
                                                    className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                                                    title="Remove Item"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Form Fields - Mobile First Layout */}
                                        <div className="space-y-4">
                                            {/* Material Number */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Material Number</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        value={item.Material}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].Material = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        placeholder="e.g. TG11 (Empty for Text Item)"
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full flex-1 h-10 px-3 transition-all"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveScanField(`material-${index}`)}
                                                        className="p-2.5 bg-white text-blue-600 border border-slate-300 rounded-lg hover:bg-blue-50 shadow-sm transition-colors flex-shrink-0"
                                                        title="Scan Barcode"
                                                    >
                                                        <Scan size={18} />
                                                    </button>
                                                </div>
                                                <span className="text-[10px] text-slate-400 mt-1 block">Leave empty to create a Service/Text item</span>
                                            </div>

                                            {/* Two Column Row - Plant & Purchasing Group */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Plant</label>
                                                    <input
                                                        value={item.Plant}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].Plant = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        required
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Purchasing Group</label>
                                                    <input
                                                        value={item.PurchasingGroup}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].PurchasingGroup = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        required
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {/* Item Description */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Item Description</label>
                                                <input
                                                    value={item.PurchaseRequisitionItemText}
                                                    onChange={e => {
                                                        const items = [...newPR._PurchaseRequisitionItem];
                                                        items[index].PurchaseRequisitionItemText = e.target.value;
                                                        setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                    }}
                                                    required={!item.Material}
                                                    placeholder="e.g. Consulting Services"
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>

                                            {/* Material Group */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Material Group</label>
                                                <input
                                                    value={item.MaterialGroup}
                                                    onChange={e => {
                                                        const items = [...newPR._PurchaseRequisitionItem];
                                                        items[index].MaterialGroup = e.target.value;
                                                        setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                    }}
                                                    required={!item.Material}
                                                    placeholder="e.g. A001"
                                                    className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                />
                                            </div>

                                            {/* Two Column Row - Quantity & Unit */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Quantity</label>
                                                    <input
                                                        type="number"
                                                        value={item.RequestedQuantity}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].RequestedQuantity = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        required
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Unit (ISO Code)</label>
                                                    <input
                                                        value={item.BaseUnit}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].BaseUnit = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        required
                                                        placeholder="e.g. PCE"
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {/* Optional Fields - Two Column Layout */}
                                        <div className="pt-4 border-t border-slate-100 mt-4 space-y-4">
                                            {/* Two Column Row - Supplier & Delivery Date */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Supplier (Optional)</label>
                                                    <input
                                                        value={item.FixedSupplier}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].FixedSupplier = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        placeholder="e.g. 100000"
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Delivery Date</label>
                                                    <input
                                                        type="date"
                                                        value={item.DeliveryDate}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].DeliveryDate = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {/* Two Column Row - Est. Price & Currency */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Est. Price</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={item.PurchaseRequisitionPrice}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].PurchaseRequisitionPrice = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Currency</label>
                                                    <input
                                                        value={item.PurReqnItemCurrency}
                                                        onChange={e => {
                                                            const items = [...newPR._PurchaseRequisitionItem];
                                                            items[index].PurReqnItemCurrency = e.target.value;
                                                            setNewPR({ ...newPR, _PurchaseRequisitionItem: items });
                                                        }}
                                                        placeholder="EUR"
                                                        className="bg-white border border-slate-300 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg w-full h-10 px-3 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="flex justify-center mb-6">
                                    <button type="button" onClick={handleAddItem} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-bold px-4 py-2 rounded-lg hover:bg-white transition-colors border border-dashed border-blue-300 bg-blue-50">
                                        <Plus size={16} /> Add Another Item
                                    </button>
                                </div>

                                <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200">
                                    <button type="button" onClick={() => setCurrentView('list')} className="btn-secondary text-slate-600 hover:bg-slate-100 font-bold border border-slate-200">
                                        Cancel
                                    </button>
                                    <button type="submit" style={{ backgroundColor: '#0ea5e9' }} className="px-8 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-lg transition-all active:scale-95 flex items-center gap-2" disabled={loading}>
                                        {loading ? <Loader className="animate-spin" size={16} /> : <Plus size={16} />}
                                        <span>Create Requisition</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* CREATE PO VIEW */}
                    {currentView === 'createPO' && (
                        <div className="animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <div>
                                    <h2 className="m-0 text-xl font-bold text-slate-800">Create Purchase Order</h2>
                                    <p className="text-sm text-slate-500 m-0 mt-1">Create a PO from an existing Purchase Requisition</p>
                                </div>
                                <button onClick={() => { setErrorDetails(null); setCurrentView('list'); navigate('/pr'); }} className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2 font-medium bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg">
                                    <X size={18} /> Cancel
                                </button>
                            </div>

                            {/* Reference PR Section */}
                            <div className="mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                                    <div className="flex-1 w-full sm:w-auto">
                                        <label className="block text-xs font-bold text-emerald-700 mb-1.5 uppercase">Reference PR (Required)</label>
                                        <input
                                            type="text"
                                            value={poReferencePR}
                                            onChange={e => setPoReferencePR(e.target.value)}
                                            placeholder="Enter PR number to load items"
                                            className="bg-white border border-emerald-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleLoadPOReference}
                                        disabled={loadingPOReference || !poReferencePR.trim()}
                                        style={{ backgroundColor: '#10b981' }}
                                        className="px-4 py-2 h-10 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {loadingPOReference ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
                                        {loadingPOReference ? 'Loading...' : 'Load PR'}
                                    </button>
                                </div>
                                <p className="text-xs text-emerald-600 mt-2">Load items from a PR to create a Purchase Order</p>
                            </div>

                            <form onSubmit={handleSubmitPO}>
                                {/* Header Data */}
                                <div className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                                    <h3 className="text-sm uppercase text-slate-400 font-bold mb-6 tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <ShoppingCart size={16} className="text-emerald-500" /> PO Header Data
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Supplier/Vendor *</label>
                                            <input
                                                value={newPO.Supplier}
                                                onChange={e => setNewPO({ ...newPO, Supplier: e.target.value })}
                                                required
                                                placeholder="e.g. 1000001"
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Purchasing Org</label>
                                            <input
                                                value={newPO.PurchasingOrganization}
                                                onChange={e => setNewPO({ ...newPO, PurchasingOrganization: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Purchasing Group</label>
                                            <input
                                                value={newPO.PurchasingGroup}
                                                onChange={e => setNewPO({ ...newPO, PurchasingGroup: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Company Code</label>
                                            <input
                                                value={newPO.CompanyCode}
                                                onChange={e => setNewPO({ ...newPO, CompanyCode: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Currency</label>
                                            <input
                                                value={newPO.DocumentCurrency}
                                                onChange={e => setNewPO({ ...newPO, DocumentCurrency: e.target.value })}
                                                className="bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg w-full h-10 px-3 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Items Section */}
                                {newPO.items.length > 0 && (
                                    <div className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                                        <h3 className="text-sm uppercase text-slate-400 font-bold mb-4 tracking-wider">
                                            PO Items ({newPO.items.length})
                                        </h3>
                                        <div className="space-y-3">
                                            {newPO.items.map((item, index) => (
                                                <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                                                {item.PurchaseOrderItem}
                                                            </span>
                                                            <div>
                                                                <p className="font-bold text-slate-800 text-sm">
                                                                    {item.Material || item.PurchaseOrderItemText || 'Text Item'}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    Plant: {item.Plant} | Qty: {item.OrderQuantity} {item.PurchaseOrderQuantityUnit}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-600">
                                                            {item.NetPriceAmount} {newPO.DocumentCurrency}
                                                        </span>
                                                    </div>
                                                    {/* Editable Fields */}
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Quantity</label>
                                                            <input
                                                                type="number"
                                                                value={item.OrderQuantity}
                                                                onChange={e => {
                                                                    const items = [...newPO.items];
                                                                    items[index].OrderQuantity = e.target.value;
                                                                    setNewPO({ ...newPO, items });
                                                                }}
                                                                className="bg-white border border-slate-300 rounded-lg w-full h-9 px-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Price</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={item.NetPriceAmount}
                                                                onChange={e => {
                                                                    const items = [...newPO.items];
                                                                    items[index].NetPriceAmount = e.target.value;
                                                                    setNewPO({ ...newPO, items });
                                                                }}
                                                                className="bg-white border border-slate-300 rounded-lg w-full h-9 px-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Plant</label>
                                                            <input
                                                                value={item.Plant}
                                                                onChange={e => {
                                                                    const items = [...newPO.items];
                                                                    items[index].Plant = e.target.value;
                                                                    setNewPO({ ...newPO, items });
                                                                }}
                                                                className="bg-white border border-slate-300 rounded-lg w-full h-9 px-2 text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Empty State */}
                                {newPO.items.length === 0 && (
                                    <div className="mb-6 p-8 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 text-center">
                                        <ShoppingCart size={32} className="mx-auto text-slate-400 mb-2" />
                                        <p className="text-slate-500 font-medium">No items loaded yet</p>
                                        <p className="text-xs text-slate-400">Enter a PR number above and click "Load PR"</p>
                                    </div>
                                )}

                                {/* Submit Buttons */}
                                <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => { setCurrentView('list'); navigate('/pr'); }}
                                        className="btn-secondary text-slate-600 hover:bg-slate-100 font-bold border border-slate-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={{ backgroundColor: '#10b981' }}
                                        className="px-8 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-lg transition-all active:scale-95 flex items-center gap-2"
                                        disabled={creatingPO || !newPO.items.length}
                                    >
                                        {creatingPO ? <Loader className="animate-spin" size={16} /> : <ShoppingCart size={16} />}
                                        <span>Create Purchase Order</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </main >
            {/* Scanner Modal */}
            {
                activeScanField && (
                    <BarcodeScanner
                        onResult={handleScanResult}
                        onClose={() => setActiveScanField(null)}
                    />
                )
            }
        </div >
    );
};

// Updated DetailItem to handle full width and proper alignment
const DetailItem = ({ label, value, fullWidth }) => (
    <div className={fullWidth ? 'col-span-2 md:col-span-4' : ''}>
        <span className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">{label}</span>
        <span className="block font-medium text-slate-800 break-words">{value !== undefined && value !== null && value !== '' ? value : '—'}</span>
    </div>
);

export default Dashboard;
