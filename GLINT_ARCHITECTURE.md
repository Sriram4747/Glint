# Glint architecture after stabilization

## Request path

1. AssistantView sends a typed text envelope through glintAPI.executeGoalStep. A future adapter can submit a final voice envelope with text and language through the same operation. Existing string callers still work.
2. The sandboxed preload invokes goal:execute. registerIPC authenticates the main frame, expected renderer page and role assigned by its BrowserWindow factory. Submitted fields cannot select a privilege level.
3. resolveGoalInput in src/shared/input.ts checks the source, length, final flag and language metadata, trims outer whitespace and returns a guidance intent carrying the Unicode goal. There is a single supported intent kind, guide. Free-form requests can ask for instructions. They cannot select an executable or shell command.
4. SettingsStore supplies the configured model, credential and guidance level. Missing credentials return an actionable error before screen capture. Minimal guidance calls GoalService.executeGoalStep. Standard guidance calls GuidanceSessionService.start. Both use CaptureService and AIService.
5. L1 adapts the validated response to text for the renderer. L2 delivers an instruction to the widget, searches via AccessibilityService, then feeds validated geometry to a non-focusable, mouse-ignoring overlay. Manual Next and periodic checks share the session state. The user performs desktop interactions.

## Ownership

| Location | Responsibility |
| --- | --- |
| src/main/index.ts, tray.ts, windows/ | Electron lifecycle, singleton windows, tray command callbacks, shortcuts and window roles. Main owns native handles. |
| src/main/ipc.ts, src/preload/ | Role-checked IPC, thin dispatch and named subscriptions. Subscribers receive data and a disposer. |
| src/shared/input.ts | Provider-independent input, guidance intent and SpeechProvider contract. No microphone implementation. |
| src/main/services/goal.ts | L1 conversation, in-memory history, inactivity timer and notification lifecycle. |
| src/main/services/guidance-session.ts | L2 session state, generation guards, repeat checks, manual stepping and notification actions. |
| src/main/services/capture.ts, overlay.ts | Serialize captures, temporarily make visible Glint windows transparent, restore original opacity, select matching display source and convert native rectangles into overlay coordinates. |
| src/main/services/accessibility*.ts, resources/find-control.ps1 | Read-only Windows UIA provider. The fixed resource loads enable-uia-dpi.ps1 before reading accessibility rectangles. The search receives labels and optional window hint in the child environment and returns structured data. |
| src/main/services/ai.ts, prompt.ts | Gemini request construction, status handling, model fallback, per-attempt deadline and response parsing. Credentials travel in a request header. |
| src/main/services/settings.ts, system-info.ts | Atomic local settings updates and Windows credential encryption, machine data through OS APIs and bounded fixed CIM commands. |
| src/renderer/src/ | React state for presentation, window-specific views, pending input and user feedback. Active session and timer ownership stays in main. |

## Persistence and boundaries

Settings live in the Electron userData directory. A key is encrypted with Windows-backed safeStorage and decrypted by main for a request. The Settings renderer receives hasApiKey. A development environment key can also be read from GEMINI_API_KEY. Invalid JSON or failed credential migration preserves the original file and reports an error. A copied encrypted file may be unreadable to another Windows account.

Screenshots and goal history are held in process memory. The active image can reach the assistant renderer for context comparison. Archived goals discard their screenshots. The configured Gemini service receives goals and screenshots during guidance and can receive two images for verification. Production diagnostics omit goal text, UIA labels, raw model JSON and vendor response bodies from the audited paths. The renderer cannot request microphone access under the current permission policy.

## Future speech adapter

SpeechProvider defines permission request, consent-bearing start, stop, cancel, partial/final events, language metadata and errors. An adapter should own one recording lifecycle, display partials, and emit a final once. The smallest MVP puts that final in an editable draft for user submission. Only then invoke goal:execute. The future microphone permission handler must authorize the intended role and active consent request while retaining today's denial for other permissions. Provider capabilities, audio transfer and retention remain decisions for review. English and Tamil tests exercise Unicode routing only.

The highest-value next separation is the L2 session transition logic from window presentation, capture, verification and retry timing. Its implementation steps and interface tests are in GLINT_IMPLEMENTATION_PLAN.md.
