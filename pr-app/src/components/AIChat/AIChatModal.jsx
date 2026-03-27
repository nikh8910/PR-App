import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Send, X, Loader2, Sparkles, MessageSquare, Mic, Scan, RotateCcw } from 'lucide-react';
import DynamicUiWidget from './DynamicUiWidget';
import McpAppIframe from './McpAppIframe';
import { geminiProvider } from '../../services/geminiProvider';
import { mcpClient } from '../../services/mcpClient';

// Helper to sanitize JSON schemas for Gemini, as Gemini strictly rejects
// some OpenAPI fields like 'additionalProperties' or 'anyOf'.
const sanitizeSchemaForGemini = (schema) => {
    if (!schema || typeof schema !== 'object') return schema;

    if (Array.isArray(schema)) {
        return schema.map(item => sanitizeSchemaForGemini(item));
    }

    const sanitized = {};

    // 1. Determine Type (Mandatory for Gemini)
    let type = schema.type;
    if (!type) {
        if (schema.properties || schema.required) type = 'object';
        else if (schema.items) type = 'array';
        else type = 'string'; // Default fallback
    }

    // Gemini does not support 'null' type or unions in 'type'
    if (Array.isArray(type)) {
        type = type.find(t => t !== 'null') || 'string';
    }
    if (type === 'null') type = 'string';

    sanitized.type = type;

    // 2. Copy Description
    if (schema.description) {
        sanitized.description = String(schema.description);
    }

    // 3. Handle Enums
    if (schema.enum && Array.isArray(schema.enum)) {
        sanitized.enum = schema.enum.map(v => String(v));
    }

    // 4. Handle Nested Structures
    if (type === 'object') {
        sanitized.properties = {};
        const props = schema.properties || {};
        for (const key in props) {
            // Recursively sanitize each property
            const sanitizedProp = sanitizeSchemaForGemini(props[key]);
            if (sanitizedProp && typeof sanitizedProp === 'object') {
                sanitized.properties[key] = sanitizedProp;
            }
        }

        if (Array.isArray(schema.required)) {
            sanitized.required = schema.required.filter(req =>
                Object.prototype.hasOwnProperty.call(sanitized.properties, req)
            );
            if (sanitized.required.length === 0) delete sanitized.required;
        }
        
        // Gemini requires properties for type: object
        if (Object.keys(sanitized.properties).length === 0) {
            // If truly no properties, we might need to remove them or add a dummy
            // but usually a tool with no params is fine with {} properties
        }
    } else if (type === 'array') {
        if (schema.items) {
            sanitized.items = sanitizeSchemaForGemini(schema.items);
        } else {
            sanitized.items = { type: 'string' };
        }
    }

    return sanitized;
};

const AIChatModal = ({ isOpen, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mcpStatus, setMcpStatus] = useState('connecting'); // connecting, connected, error
    const [availableTools, setAvailableTools] = useState([]);
    const messagesEndRef = useRef(null);

    // Initial connection
    useEffect(() => {
        if (!isOpen) return;

        const connectMcp = async () => {
            try {
                setMcpStatus('connecting');
                await mcpClient.connectAll();
                let tools = await mcpClient.listTools();
                
                console.log(`[AIChatModal] Received ${tools.length} tools from MCP`);

                // Note: Gemini 1.5/3.0 models have a hard limit of 128 FunctionDeclarations.
                // We have 300+ tools. We MUST prioritize the essential ones and slice.
                const prioritizedTools = tools.sort((a, b) => {
                    const getPriority = (name) => {
                        if (name.startsWith('render_')) return 1;
                        if (name === 'get_process_guide') return 1;
                        if (name.startsWith('api_whse_') || name.startsWith('api_warehouse_')) return 2;
                        return 3;
                    };
                    return getPriority(a.name) - getPriority(b.name);
                }).slice(0, 120);

                // Format tools for Gemini Function Declarations
                const geminiTools = prioritizedTools.map(t => {
                    try {
                        const sanitizedParams = sanitizeSchemaForGemini(t.inputSchema || { type: 'object', properties: {} });
                        return {
                            name: t.name,
                            description: t.description || `Tool ${t.name}`,
                            parameters: sanitizedParams
                        };
                    } catch (e) {
                        console.error(`[AIChatModal] Failed to sanitize tool ${t.name}:`, e);
                        return null;
                    }
                }).filter(t => t !== null);

                setAvailableTools(geminiTools);
                setMcpStatus('connected');

                // Initial greeting if empty
                if (messages.length === 0) {
                    setMessages([{
                        role: 'model',
                        text: 'Hello! I am your AI Warehouse Assistant. How can I help you today?',
                        ui: null
                    }]);
                }
            } catch (err) {
                console.error("Failed to connect to MCP:", err);
                setMcpStatus('error');
            }
        };

        connectMcp();
    }, [isOpen]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const handleSend = async (text, actionPayload = null) => {
        if ((!text.trim() && !actionPayload) || isLoading) return;

        const userMsgText = text.trim() || JSON.stringify(actionPayload);
        const newUserMsg = { role: 'user', text: userMsgText };

        // Update UI immediately with user message
        const newHistory = [...messages, newUserMsg];
        setMessages(newHistory);
        setInput('');
        setIsLoading(true);

        try {
            // Build Gemini context format
            const geminiHistory = newHistory.map(m => ({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: m.text }]
                // Note: we don't pass the UI JSON back to history, just the text. 
                // Alternatively, we could inject the 'actionPayload' text as context.
            }));

            // If actionPayload, we explicitly tell the AI mapping
            if (actionPayload) {
                const systemInstruction = `The user clicked a UI widget. Data: ${JSON.stringify(actionPayload)}. Process this action.`;
                geminiHistory[geminiHistory.length - 1].parts[0].text = systemInstruction;
            }

            const response = await geminiProvider.chat(geminiHistory, availableTools);

            setMessages(prev => [...prev, {
                role: 'model',
                text: response.message || "Done.",
                ui: response.ui || null,
                mcpAppHtml: response.mcpAppHtml || null,
                toolName: response.toolName || null,
                toolArgs: response.toolArgs || null,
                toolResultContent: response.toolResultContent || null
            }]);

        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, {
                role: 'model',
                text: "I encountered an error processing your request.",
                ui: { type: 'result_card', payload: { status: 'error', title: 'Error', details: { message: err.message } } }
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUiAction = (actionPayload) => {
        // When a user clicks a button inside a rich UI widget, send it back to Gemini
        handleSend("", actionPayload);
    };

    const handleClearChat = async () => {
        setMessages([{
            role: 'model',
            text: 'Hello! I am your AI Warehouse Assistant. How can I help you today?',
            ui: null
        }]);
        
        // Also strictly reconnect and fetch latest tools so we don't hold stale state
        try {
            setMcpStatus('connecting');
            await mcpClient.connectAll();
            let tools = await mcpClient.listTools();
            
            // Re-apply prioritization to fit under 128 limit
            const prioritizedTools = tools.sort((a, b) => {
                const getPriority = (name) => {
                    if (name.startsWith('render_')) return 1;
                    if (name === 'get_process_guide') return 1;
                    if (name.startsWith('api_whse_') || name.startsWith('api_warehouse_')) return 2;
                    return 3;
                };
                return getPriority(a.name) - getPriority(b.name);
            }).slice(0, 120);

            const geminiTools = prioritizedTools.map(t => {
                try {
                    const sanitizedParams = sanitizeSchemaForGemini(t.inputSchema || { type: 'object', properties: {} });
                    return {
                        name: t.name,
                        description: t.description || `Tool ${t.name}`,
                        parameters: sanitizedParams
                    };
                } catch (e) {
                    return null;
                }
            }).filter(t => t !== null);

            setAvailableTools(geminiTools);
            console.log(`[AIChatModal] Refreshed tools: ${geminiTools.length}`);
            setMcpStatus('connected');
        } catch (err) {
            console.error("Failed to re-connect to MCP:", err);
            setMcpStatus('error');
        }
    };

    const handleVoiceInput = () => {
        alert("Voice input capability is not yet implemented.");
    };

    const handleScanInput = () => {
        // Just mock scanning by adding a sample scanned value to input
        setInput(prev => prev + (prev.length > 0 ? " " : "") + "SCAN_12345");
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 flex flex-col bg-slate-100 animate-in slide-in-from-bottom duration-300" style={{ zIndex: 9999999 }}>

            {/* HeaderBar - Matching Kotlin SapDark gradient */}
            <div className="app-header-straight p-4 flex items-center justify-between shrink-0 shadow-md z-10 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
                <div className="flex items-center gap-3">
                    {/* Avatar Ring - 'S' */}
                    <div className="w-10 h-10 rounded-full text-white flex items-center justify-center shadow-lg shadow-blue-900/50" style={{ background: 'linear-gradient(135deg, #60a5fa, #2563eb)' }}>
                        <span className="font-extrabold text-lg">S</span>
                    </div>
                    <div>
                        <h2 className="font-bold text-white tracking-wide text-[16px]">EWM Assistant</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${mcpStatus === 'connected' ? 'bg-[#4ADE80]' : mcpStatus === 'error' ? 'bg-red-500' : 'bg-orange-500 animate-pulse'}`} />
                            <span className="text-[11px] font-medium text-slate-300">
                                {mcpStatus === 'connected' ? 'SAP Connected' : mcpStatus === 'error' ? 'Connection Error' : 'Connecting...'}
                            </span>
                        </div>
                    </div>
                </div>
                {/* Action Buttons styling matched for dark bg */}
                <div className="flex items-center gap-1">
                    <button onClick={handleClearChat} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors" title="Refresh Chat">
                        <RotateCcw size={16} />
                    </button>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors" title="Close Chat">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    return (
                        <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className={`max-w-[85%] rounded-2xl px-4 py-3 ${isUser ? 'rounded-tr-sm shadow-md' : 'rounded-tl-sm shadow-sm border border-slate-200'}`}
                                style={isUser ? { backgroundColor: '#2563EB', color: '#FFFFFF' } : { backgroundColor: '#FFFFFF', color: '#1E293B' }}
                            >

                                {/* Assistant Avatar */}
                                {!isUser && (
                                    <div className="flex gap-2 items-end mb-2 border-b border-slate-100 pb-2">
                                        <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                            <Bot size={14} />
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assistant</span>
                                    </div>
                                )}

                                {/* Message Text */}
                                <div className={`text-sm leading-relaxed ${isUser ? 'font-semibold' : 'font-medium'}`} style={{ color: 'inherit' }}>
                                    {isUser && typeof msg.text === 'string' && msg.text.startsWith('{')
                                        ? 'Clicked an action.'
                                        : String(msg.text || '')}
                                </div>

                                {/* Dynamic UI Payload */}
                                {msg.mcpAppHtml ? (
                                    <div className="mt-3 -mx-4 mb-2">
                                        <McpAppIframe 
                                            resourceHtml={msg.mcpAppHtml}
                                            toolName={msg.toolName}
                                            toolArgs={msg.toolArgs}
                                            toolResultContent={msg.toolResultContent}
                                            onAppMessage={handleUiAction}
                                        />
                                    </div>
                                ) : msg.ui ? (
                                    <div className="mt-3">
                                        <DynamicUiWidget uiData={msg.ui} onAction={handleUiAction} />
                                    </div>
                                ) : null}

                            </div>
                        </div>
                    )
                })}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-slate-500">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-widest">Thinking</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white p-3 border-t border-slate-100 shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                    className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all"
                >
                    <button
                        type="button"
                        onClick={handleScanInput}
                        disabled={mcpStatus !== 'connected' || isLoading}
                        className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                        title="Scan Barcode"
                    >
                        <Scan size={18} />
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={mcpStatus === 'connected' ? "Ask me anything..." : "Connecting..."}
                        disabled={mcpStatus !== 'connected' || isLoading}
                        className="flex-1 bg-transparent border-none outline-none px-2 py-1.5 text-sm text-slate-700 font-medium placeholder:text-slate-400 placeholder:font-normal h-10"
                    />
                    <button
                        type="button"
                        onClick={handleVoiceInput}
                        disabled={mcpStatus !== 'connected' || isLoading}
                        className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                        title="Voice Input"
                    >
                        <Mic size={18} />
                    </button>
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading || mcpStatus !== 'connected'}
                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all"
                    >
                        <Send size={18} className={input.trim() && !isLoading ? 'translate-x-0.5 -translate-y-0.5 transition-transform' : ''} />
                    </button>
                </form>
                <div className="text-center mt-2 opacity-40 flex items-center justify-center gap-1">
                    <MessageSquare size={10} />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Powered by Gemini & FastMCP</span>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default AIChatModal;
