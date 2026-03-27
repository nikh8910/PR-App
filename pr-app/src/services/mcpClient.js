/**
 * @file mcpClient.js
 * @description FastMCP Client for React web application
 * Connects to a python FastMCP server via Server-Sent Events (SSE) and executes tools via HTTP POST JSON-RPC.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

class McpClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl?.replace(/\/$/, ""); // remove trailing slash
        this.postEndpoint = null;
        this.isConnected = false;
        this.abortController = null;

        // Map of JSON-RPC ID to { resolve, reject } promises
        this.pendingRequests = new Map();
    }

    /**
     * Connects to the SSE endpoint and waits for the initial "endpoint" event.
     * @returns {Promise<void>} Resolves when the initial endpoint URL is received.
     */
    async connect() {
        if (this.isConnected) return;

        // Wrap with a 15-second timeout so a dead/unreachable endpoint
        // doesn't hang the UI forever (especially important on mobile).
        const CONNECTION_TIMEOUT_MS = 15000;

        const connectPromise = new Promise((resolve, reject) => {
            this.abortController = new AbortController();

            // Direct traffic through the Vite dev proxy at /mcp (Browser only)
            // This avoids browser CORS errors. Capacitor handles CORS natively.
            const isNative = window?.Capacitor?.isNative;
            const sseUrl = (this.serverUrl.includes('ngrok-free') && !isNative) ? '/mcp/sse' : `${this.serverUrl}/sse`;

            fetchEventSource(sseUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'ngrok-skip-browser-warning': '1'
                },
                signal: this.abortController.signal,

                onopen: async (response) => {
                    if (response.ok) {
                        console.log("[McpClient] SSE Connection opened");
                        return; // everything's good
                    }
                    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                        reject(new Error(`FastMCP server rejected connection: ${response.status}`));
                    }
                },

                onmessage: (msg) => {
                    console.log(`[McpClient] Raw SSE Event Received: event='${msg.event}', data='${msg.data}'`);
                    // FastMCP sends an 'endpoint' event with a POST URI right after connection
                    if (msg.event === 'endpoint') {
                        console.log("[McpClient] Received endpoint URL:", msg.data);
                        let pathUrl = msg.data;

                        // If we are proxying, force the endpoint to route through the proxy as well
                        if (sseUrl.startsWith('/mcp')) {
                            const parsedOriginal = new URL(pathUrl, 'https://dummy.com'); // Extract just the path+search
                            this.postEndpoint = `/mcp${parsedOriginal.pathname}${parsedOriginal.search}`;
                        } else {
                            if (pathUrl.startsWith("http")) {
                                this.postEndpoint = pathUrl;
                            } else if (pathUrl.startsWith("/")) {
                                this.postEndpoint = `${this.serverUrl}${pathUrl}`;
                            } else {
                                this.postEndpoint = `${this.serverUrl}/${pathUrl}`;
                            }
                        }
                        console.log("[McpClient] Constructed POST Endpoint:", this.postEndpoint);

                        // Perform mandatory MCP Initialization Handshake before resolving connect()
                        const initId = crypto.randomUUID();
                        this.pendingRequests.set(initId, {
                            resolve: (res) => {
                                console.log("[McpClient] Server initialized successfully:", res);

                                // 2. Send the initialized notification (fire and forget)
                                fetch(this.postEndpoint, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'ngrok-skip-browser-warning': '1'
                                    },
                                    body: JSON.stringify({
                                        jsonrpc: "2.0",
                                        method: "notifications/initialized"
                                    })
                                }).catch(e => console.warn("[McpClient] Failed to send initialized notification", e));

                                // Mark fully connected and resolve the outer connect() promise
                                this.isConnected = true;
                                resolve();
                            },
                            reject: (err) => {
                                console.error("[McpClient] Initialization rejected by server:", err);
                                reject(err);
                            }
                        });

                        // 1. Send the initialize request
                        const initPayload = {
                            jsonrpc: "2.0",
                            id: initId,
                            method: "initialize",
                            params: {
                                protocolVersion: "2024-11-05",
                                capabilities: {},
                                clientInfo: {
                                    name: "EWMAssistantWeb",
                                    version: "1.0.0"
                                }
                            }
                        };

                        fetch(this.postEndpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'ngrok-skip-browser-warning': '1'
                            },
                            body: JSON.stringify(initPayload)
                        }).catch(err => {
                            this.pendingRequests.delete(initId);
                            reject(err);
                        });
                    } else if (msg.event === 'keepalive') {
                        console.log("[McpClient] Heartbeat received");
                    } else if (msg.event === 'message' || !msg.event) {
                        if (!msg.data) return;
                        try {
                            const data = JSON.parse(msg.data);
                            console.log("[McpClient] Parsed JSON-RPC message:", data);
                            this.handleMessage(data);
                        } catch (err) {
                            console.error("[McpClient] Failed to parse SSE message:", err, msg.data);
                        }
                    } else {
                        console.log(`[McpClient] Unknown event type: ${msg.event}`);
                    }
                },

                onerror: (err) => {
                    console.error("[McpClient] SSE Error:", err);
                    if (!this.isConnected) {
                        reject(new Error("Failed to connect to MCP SSE endpoint"));
                    }
                    // Prevent immediate retries if it's a hard fail
                    throw err;
                }
            }).catch(reject);
        });

        // Race the connection promise against a timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => {
                this.abortController?.abort();
                reject(new Error(`MCP connection timeout after ${CONNECTION_TIMEOUT_MS / 1000}s for ${this.serverUrl}`));
            }, CONNECTION_TIMEOUT_MS)
        );

        return Promise.race([connectPromise, timeoutPromise]);
    }
    handleMessage(data) {
        if (!data || !data.id) return;

        const pending = this.pendingRequests.get(data.id);
        if (pending) {
            if (data.error) {
                pending.reject(data.error);
            } else {
                pending.resolve(data.result);
            }
            this.pendingRequests.delete(data.id);
        }
    }

    /**
     * Sends a generic JSON-RPC request via HTTP POST to the endpoint assigned by SSE.
     */
    async sendRequest(method, params) {
        if (!this.isConnected || !this.postEndpoint) {
            throw new Error("McpClient not fully connected yet");
        }

        const id = crypto.randomUUID();
        const payload = {
            jsonrpc: "2.0",
            id: id,
            method: method
        };

        if (params && Object.keys(params).length > 0) {
            payload.params = params;
        }

        return new Promise(async (resolve, reject) => {
            console.log(`[McpClient] Sending JSON-RPC Request | ID: ${id} | Method: ${method} | Endpoint: ${this.postEndpoint}`);
            // Register handler
            this.pendingRequests.set(id, { resolve, reject });

            // Set a timeout to avoid hanging forever
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP Request timeout for method: ${method}`));
                }
            }, 60000); // 60s timeout

            try {
                const response = await fetch(this.postEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': '1'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP HTTP Error: ${response.status} ${response.statusText}`));
                }

                // Note: We leave the Promise unresolved here deliberately because the actual
                // JSON-RPC response will arrive asynchronously via the SSE 'message' event.
                // The `handleMessage` method will look up `this.pendingRequests.get(id)`
                // and call the `resolve()` function we captured above.
            } catch (err) {
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                reject(err);
            }
        });
    }

    /**
     * Retrieves the list of available tools from the MCP server.
     */
    async listTools() {
        const result = await this.sendRequest('tools/list');
        return result.tools || [];
    }

    /**
     * Calls a specific tool natively on the MCP server.
     */
    async callTool(name, args = {}) {
        const result = await this.sendRequest('tools/call', {
            name: name,
            arguments: args
        });

        // The FastMCP protocol usually returns content as an array of Text / Object elements
        // E.g: { content: [ { type: "text", text: "..." } ] }
        if (result && result.content && Array.isArray(result.content)) {
            const textContent = result.content.find(c => c.type === 'text')?.text;
            return textContent || JSON.stringify(result.content);
        } else if (result && result.isError) {
            throw new Error("Tool execution returned error flag");
        }

        return JSON.stringify(result);
    }

    /**
     * Reads a resource from the MCP server.
     */
    async readResource(uri) {
        const result = await this.sendRequest('resources/read', { uri });
        if (result && result.contents && result.contents.length > 0) {
            return result.contents[0].text;
        }
        throw new Error("Resource not found or empty");
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.isConnected = false;
        this.postEndpoint = null;
        this.pendingRequests.clear();
    }
}

class McpClientManager {
    constructor() {
        this.clients = [];
        this.toolClientMap = new Map();
    }

    addClient(url) {
        const client = new McpClient(url);
        this.clients.push(client);
        return client;
    }

    async connectAll() {
        await Promise.allSettled(this.clients.map(c => c.connect()));
    }

    async listTools() {
        let allTools = [];
        this.toolClientMap.clear();
        for (const client of this.clients) {
            try {
                const tools = await client.listTools();
                tools.forEach(tool => {
                    this.toolClientMap.set(tool.name, { client, tool });
                    allTools.push(tool);
                });
            } catch(e) { console.error("Failed fetching tools from a client", e); }
        }
        return allTools;
    }

    async callTool(name, args) {
        const mapping = this.toolClientMap.get(name);
        if (!mapping) throw new Error(`Tool ${name} not found on any connected servers.`);
        
        const { client, tool } = mapping;
        const result = await client.sendRequest('tools/call', {
            name: name,
            arguments: args
        });

        // Resolve text response
        let textContent = "";
        if (result && result.content && Array.isArray(result.content)) {
            textContent = result.content.find(c => c.type === 'text')?.text || JSON.stringify(result.content);
        } else if (result && result.isError) {
            throw new Error(`Tool execution error: ${JSON.stringify(result)}`);
        } else {
            textContent = JSON.stringify(result);
        }

        // Detect if this tool has an associated UI resource
        let mcpAppHtml = null;
        let resourceUri = null;
        
        // Check for ext-apps UI resource uri in tool definition
        if (tool._meta?.ui?.resourceUri) {
             resourceUri = tool._meta.ui.resourceUri;
        } else if (result._meta?.ui?.resourceUri) {
             resourceUri = result._meta.ui.resourceUri;
        }

        if (resourceUri) {
             try {
                 mcpAppHtml = await client.readResource(resourceUri);
             } catch (e) {
                 console.warn(`[McpClient] Failed to load UI resource ${resourceUri}`, e);
             }
        }

        // Return a rich object instead of just a raw string
        return {
             textContent,
             structuredContent: result.structuredContent || null,
             mcpAppHtml,
             toolName: name,
             toolArgs: args
        };
    }
    
    async readResource(uri) {
        // Try reading from all capable clients
        for (const client of this.clients) {
            try { return await client.readResource(uri); } catch(e) {}
        }
        throw new Error(`Failed to read resource ${uri} from any server`);
    }

    disconnectAll() {
        this.clients.forEach(c => c.disconnect());
    }
}

export const mcpClient = new McpClientManager();

// Detect if running inside Capacitor native app (mobile)
const isNative = !!(window?.Capacitor?.isNative);

// Primary server — ngrok URL or env override
const serverUrl = import.meta.env.VITE_MCP_SERVER_URL || "https://unblusterously-spathic-bryan.ngrok-free.dev";
mcpClient.addClient(serverUrl);

// Only add localhost fallback in browser (desktop dev) — NOT on mobile.
// On mobile, 'localhost' resolves to the device itself (no server running there),
// which causes the SSE connection to hang indefinitely.
if (!isNative) {
    mcpClient.addClient("http://localhost:3005");
}
