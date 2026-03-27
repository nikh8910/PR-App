/**
 * @file HandlingUnits.jsx
 * @description Screen: Handling Unit Management (EWM)
 *
 * A 3-view screen for browsing and managing EWM Handling Units (HUs):
 *  - List View: Search HUs by Plant and/or Storage Bin, displays HU number, packaging material, location
 *  - Details View: Shows full HU details including warehouse, bin, and item contents
 *  - Create View: Form to create a new empty HU with Packaging Material, Plant, Storage Location
 *
 * ## HU Value Helps
 *  Packaging materials, plants, and storage locations are fetched on-demand from SAP
 *  via dropdown pickers. Users can also type values manually.
 *
 * SAP API: API_HANDLING_UNIT_SRV (createHandlingUnit, deleteHandlingUnit, fetchHUDetails)
 *
 * @route /handling-units
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Package, Search, Home, AlertCircle, Loader, CheckCircle, Plus,
    ArrowLeft, Trash2, Box, Factory, MapPin, Layers, List, ChevronDown
} from 'lucide-react';

const HandlingUnits = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // View State: 'list' | 'details' | 'create'
    const [view, setView] = useState('list');

    // Filter State
    const [searchPlant, setSearchPlant] = useState('');
    const [searchBin, setSearchBin] = useState('');

    // Data State
    const [handlingUnits, setHandlingUnits] = useState([]);
    const [selectedHU, setSelectedHU] = useState(null);
    const [huDetails, setHuDetails] = useState(null);

    // UI State
    const [loading, setLoading] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Create HU Form State
    const [newHU, setNewHU] = useState({
        packagingMaterial: '',
        plant: '',
        storageLocation: '',
        storageBin: ''
    });
    const [createLoading, setCreateLoading] = useState(false);

    // Value Help States
    const [plants, setPlants] = useState([]);
    const [storageLocs, setStorageLocs] = useState([]);
    const [packagingMats, setPackagingMats] = useState([]);

    // Dropdown visibility - only one dropdown at a time
    const [activeDropdown, setActiveDropdown] = useState(null); // 'plant' | 'sloc' | 'packmat' | null

    // Loading states for dropdowns
    const [dropdownLoading, setDropdownLoading] = useState(false);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.dropdown-wrapper')) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Fetch plants on demand
    const handleOpenPlantDropdown = async () => {
        if (activeDropdown === 'plant') {
            setActiveDropdown(null);
            return;
        }
        setActiveDropdown('plant');
        if (plants.length === 0) {
            setDropdownLoading(true);
            try {
                const data = await api.fetchPlantList(apiConfig);
                const results = data.d?.results || data.value || [];
                setPlants(results);
            } catch (err) {
                console.error("Error fetching plants:", err);
            } finally {
                setDropdownLoading(false);
            }
        }
    };

    // Fetch storage locations on demand (requires plant)
    const handleOpenSLocDropdown = async () => {
        if (!newHU.plant) {
            setError("Please enter a Plant first");
            return;
        }
        if (activeDropdown === 'sloc') {
            setActiveDropdown(null);
            return;
        }
        setActiveDropdown('sloc');
        setDropdownLoading(true);
        try {
            const data = await api.fetchStorageLocationsByPlant(apiConfig, newHU.plant);
            const results = data.d?.results || [];
            setStorageLocs(results);
        } catch (err) {
            console.error("Error fetching storage locations:", err);
            setStorageLocs([]);
        } finally {
            setDropdownLoading(false);
        }
    };

    // Fetch packaging materials on demand
    const handleOpenPackMatDropdown = async () => {
        if (activeDropdown === 'packmat') {
            setActiveDropdown(null);
            return;
        }
        setActiveDropdown('packmat');
        if (packagingMats.length === 0) {
            setDropdownLoading(true);
            try {
                const data = await api.fetchPackagingMaterials(apiConfig);
                const results = data.d?.results || [];
                setPackagingMats(results);
            } catch (err) {
                console.error("Error fetching packaging materials:", err);
            } finally {
                setDropdownLoading(false);
            }
        }
    };

    // Value Help Selections
    const handleSelectPlant = (plant) => {
        setNewHU({ ...newHU, plant: plant.Plant, storageLocation: '' });
        setActiveDropdown(null);
        setStorageLocs([]); // Reset SLocs when plant changes
    };

    const handleSelectSLoc = (sloc) => {
        setNewHU({ ...newHU, storageLocation: sloc.StorageLocation });
        setActiveDropdown(null);
    };

    const handleSelectPackMat = (mat) => {
        setNewHU({ ...newHU, packagingMaterial: mat.Product });
        setActiveDropdown(null);
    };

    // Load HUs
    const loadHandlingUnits = async () => {
        setLoading(true);
        setError(null);
        try {
            const filters = {};
            if (searchPlant) filters.plant = searchPlant;
            if (searchBin) filters.storageBin = searchBin;

            const data = await api.fetchHandlingUnits(apiConfig, filters);
            const results = data.value || [];
            setHandlingUnits(results);

            if (results.length === 0 && (searchPlant || searchBin)) {
                setError("No Handling Units found matching your criteria.");
            }
        } catch (err) {
            console.error("Error loading HUs:", err);
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e?.preventDefault();
        setError(null);
        loadHandlingUnits();
    };

    const handleSelectHU = async (hu) => {
        setSelectedHU(hu);
        setView('details');
        setDetailsLoading(true);
        setError(null);
        try {
            const details = await api.fetchHUDetails(apiConfig, hu.HandlingUnitExternalID, hu.EWMWarehouse || hu.Warehouse);
            setHuDetails(details);
        } catch (err) {
            console.error("Error loading HU details:", err);
            setError(extractSapMessage(err));
            setHuDetails(null);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleCreateHU = async () => {
        if (!newHU.packagingMaterial || !newHU.plant || !newHU.storageLocation) {
            setError("Packaging Material, Plant, and Storage Location are required.");
            return;
        }

        setCreateLoading(true);
        setError(null);
        try {
            const payload = {
                PackagingMaterial: newHU.packagingMaterial,
                Plant: newHU.plant,
                StorageLocation: newHU.storageLocation,
                StorageBin: newHU.storageBin || undefined,
                _HandlingUnitItem: []
            };

            const result = await api.createHandlingUnit(apiConfig, payload);
            const createdHU = result.HandlingUnitExternalID || result.d?.HandlingUnitExternalID || 'Created';

            setSuccessMsg(`HU Created: ${createdHU}`);
            setView('list');
            setNewHU({ packagingMaterial: '', plant: '', storageLocation: '', storageBin: '' });
            loadHandlingUnits();

            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            console.error("Error creating HU:", err);
            setError(extractSapMessage(err));
        } finally {
            setCreateLoading(false);
        }
    };

    const handleDeleteHU = async (hu) => {
        if (!window.confirm(`Delete Handling Unit ${hu.HandlingUnitExternalID}?`)) {
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await api.deleteHandlingUnit(apiConfig, hu.HandlingUnitExternalID);
            setSuccessMsg(`HU ${hu.HandlingUnitExternalID} deleted.`);
            setView('list');
            setSelectedHU(null);
            setHuDetails(null);
            loadHandlingUnits();
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            console.error("Error deleting HU:", err);
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => {
        setError(null);
        if (view === 'details' || view === 'create') {
            setView('list');
        } else {
            navigate('/menu', { replace: true });
        }
    };

    const openCreateView = () => {
        setError(null);
        setNewHU({ packagingMaterial: '', plant: '', storageLocation: '', storageBin: '' });
        setView('create');
    };

    // Dropdown component for reuse
    const DropdownField = ({ label, value, placeholder, dropdownKey, items, onOpen, onSelect, loading: isLoading, displayKey, descKey }) => (
        <div className="dropdown-wrapper" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>{label}</label>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        const newVal = e.target.value.toUpperCase();
                        if (dropdownKey === 'plant') {
                            setNewHU({ ...newHU, plant: newVal, storageLocation: '' });
                        } else if (dropdownKey === 'sloc') {
                            setNewHU({ ...newHU, storageLocation: newVal });
                        } else if (dropdownKey === 'packmat') {
                            setNewHU({ ...newHU, packagingMaterial: newVal });
                        }
                    }}
                    placeholder={placeholder}
                    style={{
                        width: '100%',
                        height: '48px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '0 40px 0 16px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                    }}
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpen();
                    }}
                    style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {isLoading && activeDropdown === dropdownKey ? (
                        <Loader size={18} className="animate-spin" style={{ color: '#3b82f6' }} />
                    ) : (
                        <ChevronDown size={18} style={{ color: '#64748b' }} />
                    )}
                </button>
            </div>
            {activeDropdown === dropdownKey && (
                <div style={{
                    position: 'absolute',
                    left: '20px',
                    right: '20px',
                    marginTop: '4px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '16px', textAlign: 'center' }}>
                            <Loader size={20} className="animate-spin" style={{ color: '#3b82f6' }} />
                        </div>
                    ) : items.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                            No options found - type manually
                        </div>
                    ) : (
                        items.map((item, idx) => (
                            <div
                                key={item[displayKey] || idx}
                                onClick={() => onSelect(item)}
                                style={{
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                <div style={{ fontWeight: '600', color: '#1e293b' }}>{item[displayKey]}</div>
                                {descKey && item[descKey] && (
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{item[descKey]}</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc' }}>

            {/* Fixed Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                        onClick={goBack}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                    >
                        {view === 'list' ? <Home size={20} stroke="white" strokeWidth={2} /> : <ArrowLeft size={20} stroke="white" strokeWidth={2} />}
                    </button>
                    <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'white', margin: 0 }}>
                        {view === 'create' ? 'Create HU' : view === 'details' ? 'HU Details' : 'Handling Units'}
                    </h1>
                    <div style={{ width: '40px' }}></div>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 128px 16px', position: 'relative' }}>
                <div style={{ maxWidth: '480px', margin: '0 auto' }}>

                    {view === 'list' && (
                        <button onClick={openCreateView} className="w-full bg-brand-blue text-white py-3 rounded-xl font-bold mb-4 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all">
                            <Plus size={18} strokeWidth={2.5} /> Create Handling Unit
                        </button>
                    )}

                    {view === 'list' && (
                        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                            <input
                                type="text"
                                placeholder="Plant"
                                value={searchPlant}
                                onChange={(e) => setSearchPlant(e.target.value.toUpperCase())}
                                className="flex-1 h-12 rounded-lg border border-slate-200 px-3 text-sm text-center font-medium focus:ring-2 focus:ring-brand-blue outline-none"
                            />
                            <input
                                type="text"
                                placeholder="Storage Bin"
                                value={searchBin}
                                onChange={(e) => setSearchBin(e.target.value.toUpperCase())}
                                className="flex-1 h-12 rounded-lg border border-slate-200 px-3 text-sm text-center font-medium focus:ring-2 focus:ring-brand-blue outline-none"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="h-12 px-4 rounded-lg bg-brand-blue text-white font-bold hover:bg-opacity-90 transition-colors disabled:opacity-50 shrink-0 flex items-center justify-center shadow-sm"
                            >
                                {loading ? <Loader className="animate-spin" size={18} /> : <Search size={18} />}
                            </button>
                        </form>
                    )}

                    {/* Messages */}
                    {error && (
                        <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '0 8px 8px 0', display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
                            <p style={{ fontSize: '14px', color: '#b91c1c', fontWeight: '500', margin: 0 }}>{error}</p>
                        </div>
                    )}

                    {successMsg && (
                        <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderLeft: '4px solid #10b981', borderRadius: '0 8px 8px 0', display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                            <CheckCircle size={20} style={{ color: '#059669', flexShrink: 0 }} />
                            <p style={{ fontSize: '14px', color: '#047857', fontWeight: '700', margin: 0 }}>{successMsg}</p>
                        </div>
                    )}

                    {/* LIST VIEW */}
                    {view === 'list' && (
                        <>
                            {loading && (
                                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                                    <Loader className="animate-spin" size={32} style={{ color: '#3b82f6', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#94a3b8' }}>Loading Handling Units...</p>
                                </div>
                            )}

                            {!loading && handlingUnits.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '64px 0', color: '#64748b', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                                    <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#94a3b8' }} />
                                    <p>No Handling Units found</p>
                                    <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Search by Plant or Storage Bin</p>
                                </div>
                            )}

                            {!loading && handlingUnits.map(hu => (
                                <div
                                    key={hu.HandlingUnitExternalID}
                                    onClick={() => handleSelectHU(hu)}
                                    style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'stretch', minHeight: '80px', marginBottom: '12px' }}
                                >
                                    <div style={{ width: '4px', backgroundColor: '#3b82f6', flexShrink: 0 }}></div>
                                    <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Package size={16} style={{ color: '#3b82f6' }} />
                                                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#172554', margin: 0 }}>{hu.HandlingUnitExternalID}</h3>
                                            </div>
                                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                                                {hu.PackagingMaterial || 'HU'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Factory size={12} /> {hu.Plant || 'N/A'}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MapPin size={12} /> {hu.StorageLocation || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    {/* DETAILS VIEW */}
                    {view === 'details' && (
                        <>
                            {detailsLoading ? (
                                <div style={{ textAlign: 'center', padding: '64px 0' }}>
                                    <Loader className="animate-spin" size={32} style={{ color: '#3b82f6', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#94a3b8' }}>Loading details...</p>
                                </div>
                            ) : huDetails ? (
                                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', padding: '20px' }}>
                                    <div style={{ marginBottom: '20px' }}>
                                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                            <Package size={20} style={{ color: '#3b82f6' }} />
                                            {huDetails.HandlingUnitExternalID}
                                        </h2>
                                        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                                            Packaging: <span style={{ fontWeight: '700', color: '#1d4ed8' }}>{huDetails.PackagingMaterial || 'N/A'}</span>
                                        </p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                                        <div>
                                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700' }}>Plant</span>
                                            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '4px 0 0' }}>{huDetails.Plant || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700' }}>Storage Loc</span>
                                            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '4px 0 0' }}>{huDetails.StorageLocation || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700' }}>Storage Bin</span>
                                            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '4px 0 0' }}>{huDetails.StorageBin || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700' }}>Warehouse</span>
                                            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: '4px 0 0' }}>{huDetails.Warehouse || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <Layers size={14} />
                                            Contents ({huDetails._HandlingUnitItem?.length || 0})
                                        </h3>
                                        {huDetails._HandlingUnitItem && huDetails._HandlingUnitItem.length > 0 ? (
                                            <div>
                                                {huDetails._HandlingUnitItem.map((item, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '8px' }}>
                                                        <div>
                                                            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{item.Material}</p>
                                                            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>{item.MaterialDescription || ''}</p>
                                                        </div>
                                                        <p style={{ fontSize: '14px', fontWeight: '700', color: '#3b82f6' }}>{item.Quantity} {item.QuantityUnit}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                                <Box size={24} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                                                <p style={{ fontSize: '12px', margin: 0 }}>Empty HU</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleDeleteHU(selectedHU)}
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: '700', fontSize: '14px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                    >
                                        <Trash2 size={16} /> Delete HU
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '64px 0', color: '#94a3b8' }}>
                                    <AlertCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                                    <p>Could not load HU details</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* CREATE VIEW with Working Dropdowns */}
                    {view === 'create' && (
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', padding: '20px', position: 'relative' }}>
                            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
                                Click the dropdown arrow to see available options, or type directly.
                            </p>

                            {/* Packaging Material */}
                            <DropdownField
                                label="Packaging Material *"
                                value={newHU.packagingMaterial}
                                placeholder="Enter or select"
                                dropdownKey="packmat"
                                items={packagingMats}
                                onOpen={handleOpenPackMatDropdown}
                                onSelect={handleSelectPackMat}
                                loading={dropdownLoading}
                                displayKey="Product"
                                descKey="ProductDescription"
                            />

                            {/* Plant */}
                            <DropdownField
                                label="Plant *"
                                value={newHU.plant}
                                placeholder="Enter or select"
                                dropdownKey="plant"
                                items={plants}
                                onOpen={handleOpenPlantDropdown}
                                onSelect={handleSelectPlant}
                                loading={dropdownLoading}
                                displayKey="Plant"
                                descKey="PlantName"
                            />

                            {/* Storage Location */}
                            <DropdownField
                                label="Storage Location *"
                                value={newHU.storageLocation}
                                placeholder={newHU.plant ? "Enter or select" : "Enter plant first"}
                                dropdownKey="sloc"
                                items={storageLocs}
                                onOpen={handleOpenSLocDropdown}
                                onSelect={handleSelectSLoc}
                                loading={dropdownLoading}
                                displayKey="StorageLocation"
                                descKey="StorageLocationName"
                            />

                            {/* Storage Bin - Plain Text */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Storage Bin (Optional)</label>
                                <input
                                    type="text"
                                    value={newHU.storageBin}
                                    onChange={(e) => setNewHU({ ...newHU, storageBin: e.target.value.toUpperCase() })}
                                    placeholder="e.g., BIN-A01"
                                    style={{ width: '100%', height: '48px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 16px', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                            </div>

                            <button
                                onClick={handleCreateHU}
                                disabled={createLoading || !newHU.packagingMaterial || !newHU.plant || !newHU.storageLocation}
                                className="w-full bg-brand-blue text-white font-bold text-sm rounded-lg py-3.5 mt-2 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {createLoading ? <Loader className="animate-spin" size={18} /> : 'Create Handling Unit'}
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default HandlingUnits;
