import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { X, Camera } from 'lucide-react';

const BarcodeScanner = ({ onResult, onClose }) => {
    const scannerRef = useRef(null);
    const [scanError, setScanError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const scannerId = "reader";

        const startScanner = async () => {
            try {
                // Ensure element exists
                if (!document.getElementById(scannerId)) return;

                // Cleanup any existing instance first
                if (scannerRef.current) {
                    try {
                        await scannerRef.current.stop();
                        await scannerRef.current.clear();
                    } catch (e) { /* ignore */ }
                    scannerRef.current = null;
                }

                const html5QrCode = new Html5Qrcode(scannerId);
                scannerRef.current = html5QrCode;

                const config = {
                    fps: 15,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.QR_CODE,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E
                    ]
                };

                if (!isMounted) return;

                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        if (isMounted) {
                            // Stop scanning immediately on success
                            html5QrCode.stop().then(() => {
                                if (scannerRef.current) {
                                    scannerRef.current.clear();
                                    scannerRef.current = null;
                                }
                                onResult(decodedText);
                            }).catch(err => {
                                console.warn("Failed to stop scanner", err);
                                onResult(decodedText);
                            });
                        }
                    },
                    () => { }
                );
            } catch (err) {
                if (isMounted) {
                    setScanError("Camera failed. Please check permissions.");
                    console.error(err);
                }
            }
        };

        const timer = setTimeout(startScanner, 300); // Increased delay for stability

        return () => {
            isMounted = false;
            clearTimeout(timer);
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().catch(() => { });
                    scannerRef.current.clear().catch(() => { });
                } catch (e) { }
                scannerRef.current = null;
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl w-full max-w-md flex flex-col">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <Camera size={20} className="text-blue-400" /> Scan Barcode
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 bg-black relative min-h-[300px] flex items-center justify-center">
                    <div id="reader" className="w-full h-full"></div>
                    {scanError && (
                        <div className="absolute inset-0 flex items-center justify-center text-center p-6 text-red-400">
                            {scanError}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-900 border-t border-slate-700 flex flex-col items-center gap-3">
                    <p className="text-xs text-slate-500">
                        Point camera at a QR code, EAN, or Code 128 barcode.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50 rounded-lg font-medium transition-colors"
                    >
                        Close Camera
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BarcodeScanner;
