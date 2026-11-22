# Glint current state

Audited November 20, 2026 on Windows. The starting revision was 8cdb11f on feature/hybrid-local-guidance. The preceding commits introduced local UIA plan progression and context-menu targeting. The historical Milestone 6 document describes intended behavior. The executable entry point is package.json → out/main/index.js.

| Surface | Implementation and present status |
| --- | --- |
| Launch and navigation | Single-instance tray app. A normal launch starts without an open dashboard. Open Assistant, Settings and System Details are separate windows. Double-click tray, second-instance activation and Ctrl+Shift+Space lead to the assistant. Close or blur hides it. The tray now includes an explicit stop command. |
| Text assistant (L1) | Each submitted goal captures a screen, sends a prompt and image to the configured Gemini model and displays its next instruction. Active conversation, latest screenshot and capped goal archive live in memory. Reopening compares images or offers Continue / Start New Goal. Local model-fixture tests cover the full text-to-render path. |
| Interactive guidance (L2) | An upfront model plan drives the floating widget. UIA searches for enabled controls by label. A transparent overlay highlights a rectangle. A five-second loop looks for the next control and periodically asks the model to verify changes. Next can advance manually. Pause, resume, stop and completion exist. Desktop-root lookup missed the controlled target on this host. See the separate evidence for downstream overlay behavior in GLINT_TEST_REPORT.md. |
| Screen capture | Main-process desktopCapturer returns a PNG data URL, display ID and luminance signature. Existing guidance uses the primary display. The capture service excludes registered Glint windows and restores their original opacity on failure. There is no standalone screenshot gallery or export UI. |
| System Details | CPU, memory and host come from Node, display data from Electron, OS caption and graphics adapters from bounded Windows CIM queries. Shows a loading state and unavailable fields. |
| Preferences | Six Settings tabs. Guidance level and Gemini model affect execution. Accent color applies to Settings. The Google credential is write-only in the UI and encrypted on disk. Legacy plaintext migrates on load. Hotkeys shows the actual fixed shortcut. Startup registration, theme switching, voice capture and configurable stacking lack operating implementations. Their controls indicate current availability. |
| Reminders | L1 has a two-minute inactivity timer, Windows notification, resume, snooze and completion. L2 pause/completion request separate notifications. There is no user-created countdown, pauseable timer or scheduler. |
| Desktop execution (L3) | No intent-to-OS action executor or confirmation flow. Model action labels describe what the user should do. The locator reads accessibility properties. No automatic click, typing, application launcher or image-coordinate locator was found. |
| Speech | Source-tagged finalized transcripts can enter the text guidance route. A replaceable provider contract exists. Microphone capture, speech recognition, speech synthesis and language accuracy remain future work. |

## Development and release

Main, preload and the React 18 renderer build with electron-vite. TypeScript has separate main/preload and renderer projects. The installed runtime was Electron 33.4.11. Use npm ci for a clean install, npm run dev for development, npm run typecheck and npm run build for validation, and npm start for a built preview. Run npm run test:desktop on an interactive Windows host after building. Its temporary profiles isolate the developer's saved data.

There is no installer script, signing configuration, packaged-resource verification or CI job in the inspected tree. Current window positions and conversations end with the process. Neither a signed installation nor a live Gemini session was validated.
