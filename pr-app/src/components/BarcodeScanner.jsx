import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { X, Camera } from 'lucide-react';

/**
 * BarcodeScanner — renders via React Portal to always appear above ALL UI.
 * Accepts both onScan and onResult props for backward compatibility.
 */
const BarcodeScanner = ({ onScan, onResult, onClose }) => {
    const scannerRef = useRef(null);
    const containerRef = useRef(null);
    const [scanError, setScanError] = useState(null);
    const [starting, setStarting] = useState(true);

    // Support both prop names
    const handleResult = onScan || onResult;

    useEffect(() => {
        let isMounted = true;
        let html5QrCode = null;

        const startScanner = async () => {
            try {
                const el = containerRef.current?.querySelector('#barcode-reader');
                if (!el) {
                    console.error("Scanner element not found");
                    if (isMounted) setScanError("Scanner element not found");
                    return;
                }

                html5QrCode = new Html5Qrcode("barcode-reader");
                scannerRef.current = html5QrCode;

                const config = {
                    fps: 10,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const size = Math.floor(minEdge * 0.7);
                        return { width: Math.max(size, 150), height: Math.max(size, 150) };
                    },
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.DATA_MATRIX,
                        Html5QrcodeSupportedFormats.ITF,
                    ],
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    }
                };

                if (!isMounted) return;

                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        if (isMounted && handleResult) {
                            isMounted = false; // Prevent double-fire
                            html5QrCode.stop().then(() => {
                                try { html5QrCode.clear(); } catch (e) { }
                                scannerRef.current = null;
                                handleResult(decodedText);
                            }).catch(() => {
                                scannerRef.current = null;
                                handleResult(decodedText);
                            });
                        }
                    },
                    () => { /* ignore per-frame errors */ }
                );

                if (isMounted) setStarting(false);
            } catch (err) {
                console.error("Camera error:", err);
                if (isMounted) {
                    const msg = err?.toString?.() || '';
                    if (msg.includes('NotAllowed')) {
                        setScanError("Camera permission denied. Allow camera in settings.");
                    } else if (msg.includes('NotFound') || msg.includes('NotReadable')) {
                        setScanError("No camera found or camera is in use.");
                    } else {
                        setScanError("Camera failed: " + (err?.message || err));
                    }
                    setStarting(false);
                }
            }
        };

        const timer = setTimeout(startScanner, 600);

        return () => {
            isMounted = false;
            clearTimeout(timer);
            const scanner = scannerRef.current;
            if (scanner) {
                try {
                    scanner.stop().then(() => {
                        try { scanner.clear(); } catch (e) { }
                    }).catch(() => { });
                } catch (e) { }
                scannerRef.current = null;
            }
        };
    }, []);

    const handleClose = async () => {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (scanner) {
            try {
                await scanner.stop();
                try { scanner.clear(); } catch (e) { }
            } catch (e) {
                // Stop may fail if already stopped — that's fine
            }
        }
        if (onClose) onClose();
    };

    // Render via Portal to escape ALL parent stacking contexts
    return ReactDOM.createPortal(
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: '16px',
                paddingTop: 'env(safe-area-inset-top, 16px)',
                paddingBottom: 'env(safe-area-inset-bottom, 16px)',
            }}
        >
            <div style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                width: '100%',
                maxWidth: '420px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Camera size={20} style={{ color: '#60a5fa' }} />
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '16px' }}>Scan Barcode</span>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Camera viewport */}
                <div style={{
                    position: 'relative',
                    backgroundColor: 'black',
                    minHeight: '300px',
                    height: '50vw',
                    maxHeight: '400px',
                    flexShrink: 0,
                }}>
                    <div id="barcode-reader" style={{ width: '100%', height: '100%' }}></div>

                    {starting && !scanError && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                        }}>
                            <div style={{
                                width: '40px', height: '40px',
                                border: '3px solid #60a5fa',
                                borderTop: '3px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                marginBottom: '16px',
                            }}></div>
                            <p style={{ color: '#93c5fd', fontSize: '14px', fontWeight: 500 }}>Starting camera...</p>
                            <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Allow camera access if prompted</p>
                        </div>
                    )}

                    {scanError && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            padding: '24px',
                            textAlign: 'center',
                        }}>
                            <Camera size={40} style={{ color: '#f87171', opacity: 0.5, marginBottom: '12px' }} />
                            <p style={{ color: '#f87171', fontSize: '14px', fontWeight: 500 }}>{scanError}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px',
                    borderTop: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    flexShrink: 0,
                }}>
                    <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                        Point camera at barcode (QR, EAN, Code128, DataMatrix)
                    </p>
                    <button
                        onClick={handleClose}
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.4)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '15px',
                            cursor: 'pointer',
                        }}
                    >
                        Close Camera
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                #barcode-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
                #barcode-reader img[alt="Info icon"] { display: none !important; }
                #barcode-reader > div { border: none !important; }
            `}</style>
        </div>,
        document.body
    );
};

export default BarcodeScanner;
