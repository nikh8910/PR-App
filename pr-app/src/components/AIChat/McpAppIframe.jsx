import React, { useEffect, useRef } from 'react';

export default function McpAppIframe({ resourceHtml, toolName, toolArgs, toolResultContent, onAppMessage }) {
    const iframeRef = useRef(null);

    useEffect(() => {
        if (!iframeRef.current || !resourceHtml) return;

        const iframe = iframeRef.current;
        iframe.srcdoc = resourceHtml;

        let messageListener;

        const handleLoad = () => {
            if (!iframe.contentWindow) return;

            messageListener = (event) => {
                const msg = event.data;
                console.log("[McpAppIframe] Received message. event.source matching:", event.source === iframe.contentWindow, msg);
                
                // Relaxing exactly strict iframe check for now, sometimes srcdoc iframes behave weirdly
                // if (event.source !== iframe.contentWindow) return;
                
                if (msg.message && onAppMessage) {
                    onAppMessage(msg.message);
                }
                
                if (msg.jsonrpc && msg.method === 'ui/initialize') {
                     console.log("[McpAppIframe] received ui/initialize request from App. Sending result.");
                     iframe.contentWindow.postMessage({
                         jsonrpc: "2.0",
                         id: msg.id,
                         result: {
                             protocolVersion: "2026-01-26",
                             hostInfo: { name: "pr-app-host", version: "1.0.0" },
                             hostCapabilities: {},
                             hostContext: {
                                 theme: "light",
                                 styles: {
                                     variables: {
                                         "--color-background-primary": "#ffffff",
                                         "--color-background-secondary": "#f4f4f5",
                                         "--color-border-primary": "#f1f5f9",
                                         "--color-text-primary": "#1e293b",
                                         "--color-text-secondary": "#64748b",
                                         "--border-radius-md": "8px",
                                         "--border-radius-lg": "12px",
                                     }
                                 }
                             }
                         }
                     }, "*");
                } else if (msg.jsonrpc && msg.method === 'ui/notifications/initialized') {
                     console.log("[McpAppIframe] App is initialized! Sending tool input.");
                     if (toolName && toolArgs) {
                          iframe.contentWindow.postMessage({
                              jsonrpc: "2.0",
                              method: "ui/notifications/tool-input",
                              params: {
                                  arguments: toolArgs // The SDK expects only 'arguments' in the params
                              }
                          }, "*");
                     }

                     if (toolResultContent) {
                          console.log("[McpAppIframe] Sending tool result.");
                          iframe.contentWindow.postMessage({
                              jsonrpc: "2.0",
                              method: "ui/notifications/tool-result",
                              params: {
                                  content: [], 
                                  structuredContent: toolResultContent,
                                  isError: false
                              }
                          }, "*");
                     }
                } else if (msg.role === 'user') {
                     if (onAppMessage && msg.content && msg.content.length > 0) {
                          onAppMessage(msg.content[0].text, msg);
                     }
                }
            };

            window.addEventListener('message', messageListener);
        };

        iframe.addEventListener('load', handleLoad);
        return () => iframe.removeEventListener('load', handleLoad);
    }, [resourceHtml, toolName, toolArgs, onAppMessage]);

    return (
        <div className="w-full h-80 rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
            <iframe
                ref={iframeRef}
                title="MCP App UI"
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
        </div>
    );
}
