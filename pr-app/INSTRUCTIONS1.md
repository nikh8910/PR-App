# SAP EWM AI Assistant — Android App
## Project Brief for Antigravity Agent

---

## What You Are Building

A warehouse worker mobile app for Android. Workers use it to interact with SAP S/4HANA EWM (Extended Warehouse Management) using natural language, barcode scanning, voice, and camera. The app sends the worker's intent to an AI model (Claude or Gemini), which decides which SAP action to take, executes it via an MCP server, and returns both a plain-language reply AND a native UI widget to render.

**Tech stack:**
- Language: Kotlin
- UI: Jetpack Compose
- Architecture: MVVM (ViewModel + StateFlow)
- AI: Anthropic Claude API + Google Gemini API (user can toggle)
- MCP connection: OkHttp SSE client to a FastMCP Python server
- Barcode scanning: CameraX + ML Kit Barcode Scanning
- Camera OCR: CameraX + ML Kit Text Recognition
- Voice: Android SpeechRecognizer (built-in, no extra library)
- HTTP: OkHttp 4 + Gson

---

## Project Structure to Create

```
app/
└── src/main/
    ├── AndroidManifest.xml
    └── java/com/ewm/sapapp/
        ├── model/
        │   └── UiSpec.kt
        ├── mcp/
        │   └── McpClient.kt
        ├── api/
        │   └── AiProviders.kt
        ├── viewmodel/
        │   └── ChatViewModel.kt
        └── ui/
            ├── screens/
            │   ├── ChatScreen.kt
            │   ├── BarcodeScannerScreen.kt
            │   └── CameraOcrScreen.kt
            ├── components/
            │   └── DynamicUiWidget.kt
            └── theme/
                └── Colors.kt
```

---

## Guidline Specifications



### 1. `mcp/McpClient.kt`

SSE (Server-Sent Events) client that connects to the FastMCP Python server via HTTP.

**How MCP over SSE works:**
1. Open a GET `/sse` connection → server sends an `endpoint` event with a POST URL
2. Send JSON-RPC requests via POST to that URL
3. Receive JSON-RPC responses as SSE `message` events
4. Match responses to requests by `id` field


**Critical implementation details:**
- OkHttp `readTimeout` must be `0` for SSE (infinite)
- Use `ConcurrentHashMap<String, Pending>` where `Pending` holds a `CountDownLatch` + `AtomicReference<JsonObject>`
- Each RPC call generates a UUID `id`, stores a `Pending`, sends HTTP POST, then `latch.await(60s)`
- `handleIncoming(data)` is called on SSE message events: parse JSON, find pending by id, set result, count down latch
- `serverUrl` comes from `BuildConfig.MCP_SERVER_URL`


### 3. `api/AiProviders.kt`

Two AI provider implementations sharing the same interface. Both implement a tool-use agentic loop — they keep calling SAP tools until they have a final answer.

```kotlin example
data class Message(val role: String, val content: String)
sealed class AiResult {
    data class Success(val response: ClaudeResponse, val toolCallCount: Int = 0) : AiResult()
    data class Failure(val error: String) : AiResult()
}
interface AiProvider {
    val name: String
    suspend fun chat(history: List<Message>, tools: List<McpTool>): AiResult
}
```


**GeminiProvider — Google AI:**
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={apiKey}`
- Tools format: `functionDeclarations` array with `{name, description, parameters}`
- Loop: check for `functionCall` parts in response → call `mcpClient.callTool()` → add `functionResponse` parts → repeat
- System prompt: send as first user/model turn pair (Gemini doesn't have a system field)

**Structured response parsing:**
Both providers must call `parseResponse(rawText)` on the final text to produce `ClaudeResponse`. This tries `gson.fromJson(cleaned, ClaudeResponse::class.java)` and falls back to `ClaudeResponse(message = rawText)` if it fails. Strip ` ```json ` fences before parsing.

**System prompt** (both providers):
```
You are an SAP EWM warehouse assistant embedded in a mobile app.
Workers interact via text, voice, and barcode scans.

CRITICAL — You MUST respond ONLY with valid JSON in this exact format:
{
  "message": "Short plain-language reply (max 2 sentences)",
  "ui": <render_ui tool result, or null>
}

Rules:
- ALWAYS call render_ui with type=confirm_action before any SAP write operation
- ALWAYS call render_ui with type=result_card after completing a SAP action
- For multi-step workflows use type=workflow_stepper
- Use type=item_list when showing a list of SAP results to choose from
- Use type=field_form when the user needs to enter or confirm editable fields
- Use type=quick_actions to suggest likely next steps
- Keep "message" SHORT — workers are wearing gloves
- Extract values from [SCANNED: value] and [CAMERA_TEXT: text] tags
- Never expose raw SAP error codes — translate to plain English
```

---

### 4. `viewmodel/ChatViewModel.kt` example

AndroidViewModel managing all state and routing all input types.

**State:**
```kotlin sample
enum class ConnectionStatus { CONNECTING, CONNECTED, ERROR }
enum class AiModel { CLAUDE, GEMINI }
enum class MessageRole { USER, ASSISTANT }

data class ChatMessage(
    val role: MessageRole,
    val text: String,
    val ui: UiSpec? = null,
    val toolCallCount: Int = 0,
    val id: Long = System.nanoTime(),
)

data class AppState(
    val messages: List<ChatMessage>,      // chat history shown in UI
    val isLoading: Boolean = false,
    val error: String? = null,
    val mcpStatus: ConnectionStatus,
    val mcpToolCount: Int = 0,
    val activeModel: AiModel = AiModel.CLAUDE,
    val pendingUi: UiSpec? = null,        // widget shown above input bar
    val editedFields: Map<String, String> = emptyMap(),
)
```

**Init:** Call `connectMcp()` in `init` block — connects McpClient and calls `listTools()`, updates `mcpStatus` and `mcpToolCount`.

**Public functions:**
- `fun send(text: String)` — text message
- `fun onBarcodeScanned(value: String)` — wraps as `[SCANNED: $value]`, display text as `📷 Scanned: $value`
- `fun onCameraOcr(text: String)` — wraps as `[CAMERA_TEXT: $text]`, display as `📸 Read: $text`
- `fun onVoiceResult(spoken: String)` — sends directly
- `fun onUiAction(actionValue: String, actionLabel: String)` — builds context message including edited fields and current UI type, clears `pendingUi` and `editedFields`, sends
- `fun onFieldEdit(key: String, value: String)` — updates `editedFields`
- `fun onItemSelected(item: UiItem)` — sends `Selected: ${item.title} (value=${item.value})`
- `fun dismissUi()` — clears `pendingUi`
- `fun switchModel(model: AiModel)` — updates `activeModel`
- `fun clearConversation()` — clears history and resets state

**Flow:** All input methods call `addUserMessage()` then `callAi()`. `callAi()` picks provider based on `activeModel`, calls `provider.chat(history, tools)`, on success adds assistant message and sets `pendingUi = response.ui`.

**Config** (read from BuildConfig):
```kotlin
private val MCP_URL    = BuildConfig.MCP_SERVER_URL
private val CLAUDE_KEY = BuildConfig.ANTHROPIC_API_KEY
private val GEMINI_KEY = BuildConfig.GEMINI_API_KEY
```

---

### 5. `ui/components/DynamicUiWidget.kt`

Top-level `DynamicUiWidget` composable that dispatches to one of 6 sub-composables based on `spec.type`. Wrap in `AnimatedVisibility` with slide-up + fade-in enter, slide-down + fade-out exit.

**`ConfirmActionWidget`** (`confirm_action`):
- Card with orange warning icon + title
- Summary table of `spec.fields` (label → value, read-only)
- Row of action buttons (default: Confirm + Cancel)
- `Cancel` calls `onDismiss`

**`FieldFormWidget`** (`field_form`):
- Card with title
- For each field: if `editable=true` → `OutlinedTextField` with current value from `editedFields[field.key] ?: field.value`; if `editable=false` → label/value row
- Submit + Cancel buttons at bottom

**`WorkflowStepperWidget`** (`workflow_stepper`):
- Card with horizontal stepper
- Each step: circle (green+checkmark if done, blue if active, grey otherwise) + label below
- Connector line between steps (green if previous step done, grey otherwise)

**`ResultCardWidget`** (`result_card`):
- Background/icon/title colour based on `spec.status`: green=success, orange=warning, red=error
- Key-value pairs from `spec.data`
- Optional action buttons or a "Done" text button

**`ItemListWidget`** (`item_list`):
- Card with title + close button
- Each item: tappable row with title, subtitle, optional badge chip
- Show max 8 items; show "+ N more" if list is longer

**`QuickActionsWidget`** (`quick_actions`):
- Horizontal scrollable row of `SuggestionChip`s
- SAP blue tint

**`ActionButton`** shared composable: `primary` → filled SAP blue; `secondary` → outlined; `danger` → filled red.

---

### 6. `ui/screens/ChatScreen.kt`

Main screen composable.

**Top app bar (SAP dark `#1C2B33`):**
- Title: "EWM Assistant" + connection status row (coloured dot + status text)
- Actions: Claude/Gemini toggle button + clear conversation icon button

**Message list:**
- `LazyColumn` auto-scrolling to bottom on new messages
- User bubbles: right-aligned, SAP blue background, white text, `topEnd` corner = 4.dp
- Assistant bubbles: left-aligned, white background, dark text, `topStart` corner = 4.dp
- Animated "Checking SAP…" thinking indicator with circular progress

**Dynamic UI widget:**
- Shown between message list and input bar
- `AnimatedVisibility` expand/shrink vertically

**Input bar (white surface with elevation):**
- 4 icons: barcode scan, camera OCR, voice mic, send
- `OutlinedTextField` with rounded 22dp corners
- All icons tinted SAP blue `#0070F2`
- Disabled when `isLoading = true`

**Permission launchers:**
- Camera permission → opens `BarcodeScannerScreen`
- Camera permission (second launcher) → opens `CameraOcrScreen`
- `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` for voice

---

### 7. `ui/screens/BarcodeScannerScreen.kt`

Full-screen CameraX preview with ML Kit barcode scanning.

- Bind `Preview` + `ImageAnalysis` use cases to back camera
- `ImageAnalysis` strategy: `STRATEGY_KEEP_ONLY_LATEST`
- Scanner options: `CODE_128, CODE_39, QR_CODE, DATA_MATRIX, EAN_13, EAN_8`
- On first scan: set `isScanning = false`, store value
- Show result card with "Scan Again" + "Use This" buttons
- "Use This" calls `onScanned(value)`, parent closes screen

---

### 8. `ui/screens/CameraOcrScreen.kt`

Full-screen CameraX with ML Kit Text Recognition for reading SAP labels.

- Use `TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)`
- Process frames via `ImageAnalysis`, same pattern as barcode scanner
- Extract `text.text` from `RecognitionTask` result
- Show recognised text in a card with "Re-scan" + "Use This" buttons
- "Use This" calls `onResult(text)`, parent closes screen

---

### 9. `ui/theme/Colors.kt`

```kotlin
val SapBlue   = Color(0xFF0070F2)
val SapDark   = Color(0xFF1C2B33)
val SapLight  = Color(0xFFEAF4FF)
val SapGreen  = Color(0xFF107E3E)
val SapOrange = Color(0xFFE76500)
val SapCardBg = Color(0xFFFFFFFF)
val SapBgGrey = Color(0xFFF5F7F9)
```

---

### 10. `AndroidManifest.xml`

Required permissions:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Activity: `windowSoftInputMode="adjustResize"`

---

### 11. `build.gradle.kts` (app module)

```kotlin
// BuildConfig fields
buildConfigField("String", "ANTHROPIC_API_KEY", ...)
buildConfigField("String", "GEMINI_API_KEY", ...)
buildConfigField("String", "MCP_SERVER_URL", ...)

// Dependencies
// Compose BOM 2024.09.00
// androidx.compose.material:material-icons-extended
// androidx.activity:activity-compose:1.9.2
// androidx.lifecycle:lifecycle-viewmodel-compose:2.8.5
// com.squareup.okhttp3:okhttp:4.12.0
// com.squareup.okhttp3:okhttp-sse:4.12.0
// com.google.code.gson:gson:2.10.1
// CameraX 1.3.4 (core, camera2, lifecycle, view)
// com.google.mlkit:barcode-scanning:17.3.0
// com.google.android.gms:play-services-mlkit-text-recognition:19.0.0
// org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1
```

---

### 12. `local.properties` (user must fill in)

```properties
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
MCP_SERVER_URL=https://YOUR-NGROK-URL.ngrok-free.app
```

---

## Visual Design Spec

**Colour palette:** SAP Horizon design system
- Primary: `#0070F2` (SAP Blue)
- Dark surface: `#1C2B33`
- Background: `#F5F7F9`
- Success: `#107E3E`
- Warning/action: `#E76500`

**Corner radius:** 22dp input field, 16dp cards, 10dp buttons

**Typography:** Use `MaterialTheme.typography` defaults, `FontWeight.Bold` for headers, `14sp` body text in bubbles

**Status indicator:** Small coloured circle dot next to connection status text in top bar (yellow=connecting, green=connected, orange=error)

**AI indicator:** "⚙ N SAP calls" shown in small grey text below assistant bubbles

---

## What You Do NOT Need to Build

- The FastMCP Python server (already built, running separately)
- SAP OData calls directly from the app (the MCP server handles all of that)
- Any SAP authentication in the app
- Backend infrastructure

---

## Testing Checklist

After generating the app, verify:
- [ ] App compiles without errors
- [ ] McpClient connects to ngrok URL and lists tools
- [ ] Sending "hello" shows a response in the chat
- [ ] Barcode scanner opens on scan icon tap (with camera permission)
- [ ] Voice input launches Android speech recogniser
- [ ] Model toggle button switches between Claude/Gemini labels
- [ ] DynamicUiWidget renders all 6 types (test by hardcoding a UiSpec temporarily)
- [ ] Tapping an action in confirm_action sends message back
- [ ] Tapping "Done" on result_card clears the widget
