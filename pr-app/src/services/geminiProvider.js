/**
 * @file geminiProvider.js
 * @description Gemini AI agentic loop for interacting with the SAP MCP server.
 * Handles the Tool Use capability to automatically fetch data before returning to the user.
 */

import { mcpClient } from './mcpClient';

const SYSTEM_PROMPT = `
You are an SAP EWM warehouse assistant embedded in a web app.
Workers interact via text.

CRITICAL INSTRUCTION 1:
BEFORE you perform ANY business operation, answer ANY stock enquiry, or fetch ANY data, you MUST call the "get_process_guide" tool with the relevant process name.
NEVER call an SAP OData tool directly without first calling "get_process_guide". Do not guess API endpoints. You MUST read the guide first.

CRITICAL INSTRUCTION 2:
When you have finished all tool calls and are ready to respond to the user, you MUST respond ONLY with valid JSON in this exact format, with no markdown fences:
{
  "message": "Short plain-language reply (max 2 sentences)",
  "ui": null | { ... }
}

Important UI Rules:
1. If there is a tool available to render the UI (e.g., render_item_list, render_result_card), you MUST call that tool to display the data instead of returning it in the "ui" property. If you call an MCP UI tool, set "ui": null.
2. Only if no rendering tool is available, use the legacy "ui" property with types: "item_list", "result_card", "confirm_action", "quick_actions", "field_form".
- Keep "message" SHORT.
- Never expose raw SAP error codes — translate to plain English.
`;

// Maximum number of tool-call iterations before forcing a final answer
const MAX_TOOL_ITERATIONS = 8;

class GeminiProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
    }

    /**
     * Makes a single call to the Gemini API.
     * @param {Array} messages   Conversation history in Gemini format.
     * @param {Array} tools      Available tool declarations.
     * @param {boolean} forceJson When true, adds JSON mime type (only for final text response).
     */
    async _callGemini(messages, tools, forceJson = false) {
        const requestBody = {
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: messages,
            tools: tools.length > 0 ? [{ functionDeclarations: tools }] : [],
            generationConfig: {
                temperature: 0.1,
                // Only force JSON when we are NOT in a function-calling round.
                // Combining responseMimeType + functionDeclarations causes Gemini to
                // skip tool calls and return an empty/stuck response.
                ...(forceJson ? { responseMimeType: 'application/json' } : {})
            }
        };

        const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errBody}`);
        }

        return response.json();
    }

    /**
     * Executes the agentic chat loop with a hard iteration cap.
     * @param {Array} history  Previous messages { role, parts }.
     * @param {Array} tools    Available tools in Gemini format.
     */
    async chat(history, tools) {
        if (!this.apiKey) throw new Error('VITE_GEMINI_API_KEY is not set');

        let messages = [...history];
        let capturedAppHtml = null;
        let capturedToolName = null;
        let capturedToolArgs = null;
        let capturedToolResultContent = null;

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            console.log(`[GeminiProvider] Agentic loop iteration ${iteration + 1}/${MAX_TOOL_ITERATIONS}`);

            // On the last iteration, force JSON and don't pass tools
            // so Gemini is forced to produce a final text answer.
            const isFinalIteration = iteration === MAX_TOOL_ITERATIONS - 1;
            const activeTools = isFinalIteration ? [] : tools;
            const forceJson = isFinalIteration;

            let data;
            try {
                data = await this._callGemini(messages, activeTools, forceJson);
            } catch (error) {
                console.error('[GeminiProvider] API call failed:', error);
                throw error;
            }

            const candidate = data.candidates?.[0];
            if (!candidate) throw new Error('No response candidate returned from Gemini');

            const parts = candidate.content?.parts || [];
            const functionCalls = parts.filter(p => p.functionCall);
            const finishReason = candidate.finishReason;

            console.log(`[GeminiProvider] Finish reason: ${finishReason}, Function calls: ${functionCalls.length}`);

            // --- Case 1: Model wants to call tools ---
            if (functionCalls.length > 0) {
                // Add model's tool-call turn to history
                messages.push({ role: 'model', parts });

                const functionResponses = [];

                for (const call of functionCalls) {
                    const fnName = call.functionCall.name;
                    const fnArgs = call.functionCall.args;
                    let resultStr = '';

                    try {
                        console.log(`[GeminiProvider] Calling MCP tool: ${fnName}`, fnArgs);
                        const result = await mcpClient.callTool(fnName, fnArgs);
                        resultStr = result.textContent;

                        // Capture UI app HTML from any tool in the chain
                        if (result.mcpAppHtml && !capturedAppHtml) {
                            capturedAppHtml = result.mcpAppHtml;
                            capturedToolName = result.toolName;
                            capturedToolArgs = result.toolArgs;
                            capturedToolResultContent = result.structuredContent || result.textContent || null;
                        }
                    } catch (e) {
                        console.error(`[GeminiProvider] Tool ${fnName} failed:`, e);
                        resultStr = `Error executing tool: ${e.message}`;
                    }

                    functionResponses.push({
                        functionResponse: {
                            name: fnName,
                            response: { content: resultStr }
                        }
                    });
                }

                // Add tool results as a user turn and continue loop
                messages.push({ role: 'user', parts: functionResponses });
                continue; // next iteration
            }

            // --- Case 2: Model returned a text response (STOP or MAX_TOKENS) ---
            const textResponse = parts.find(p => p.text)?.text || '';
            const parsed = this.parseResponse(textResponse);

            // Attach any captured MCP App UI
            if (capturedAppHtml && !parsed.mcpAppHtml) {
                parsed.mcpAppHtml = capturedAppHtml;
                parsed.toolName = capturedToolName;
                parsed.toolArgs = capturedToolArgs;
                parsed.toolResultContent = capturedToolResultContent;
            }

            return parsed;
        }

        // Fell through the loop (hit MAX_TOOL_ITERATIONS) — force a text response
        console.warn('[GeminiProvider] Hit max tool iterations, forcing final answer.');
        const fallback = await this._callGemini(messages, [], true);
        const textResponse = fallback.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || '';
        const parsed = this.parseResponse(textResponse || '{"message":"I reached the maximum number of steps. Please rephrase your question.","ui":null}');

        if (capturedAppHtml && !parsed.mcpAppHtml) {
            parsed.mcpAppHtml = capturedAppHtml;
            parsed.toolName = capturedToolName;
            parsed.toolArgs = capturedToolArgs;
            parsed.toolResultContent = capturedToolResultContent;
        }

        return parsed;
    }

    parseResponse(rawText) {
        // Strip markdown code fences if Gemini added them despite the system prompt
        let cleaned = rawText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();

        try {
            return JSON.parse(cleaned);
        } catch (err) {
            console.warn('[GeminiProvider] Failed to parse JSON, falling back to raw text.', rawText);
            return { message: rawText || 'Something went wrong.', ui: null };
        }
    }
}

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
export const geminiProvider = new GeminiProvider(apiKey);
