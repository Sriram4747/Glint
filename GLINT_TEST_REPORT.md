# Windows stabilization test report

**Run date:** November 20, 2026. **Baseline:** 8cdb11f, feature/hybrid-local-guidance. **Toolchain:** Node 24.14.1, Electron 33.4.11, TypeScript 5.9.3, electron-vite 2.3.0, Vite 5.4.21, React 18.3.1. Tests ran on Windows with two reported displays; primary scale was 175%.

## Setup and reproduction

1. Use the locked dependencies from npm ci. npm ls --depth=0 succeeded against the working installation. A separate clean restore installed 141 packages. The first offline restore failed with ENOTCACHED for yauzl; the network-enabled lockfile restore succeeded. npm reported a transitive boolean@3.2.0 deprecation.
2. Run npm run typecheck, then npm run build. Baseline build passed and renderer typechecking produced four errors (settings shape, guidance-level value and two missing model declarations). Both type projects and all three production bundles now build successfully.
3. Run npm run test:desktop from Windows after building. tests/desktop/run.cjs starts Electron in a fresh temp profile, relaunches it, seeds a legacy profile, tests a real idle timeout and exercises damaged JSON. The runner uses a temporary working directory and removes inherited provider credentials. Tests call the built application's tray callbacks, React controls, preload, IPC, Windows APIs and disk storage.
4. The harness substitutes an in-process Gemini transport, sends no screen images to a live model, and uses a Windows Forms button for L2. It first tries production desktop-root UIA. If that misses the controlled test button, the harness can query its known native handle. The console reports which lookup was used. That fallback exists only under tests/desktop.
5. Expected error logs include invalid settings, an unauthorized window request, empty screen source, provider 403, aborted request and damaged settings. The runner verifies the caller's result and exits nonzero on an assertion failure. Screenshots, credentials and user-specific hardware names are excluded from this report.

## Workflow evidence

| Workflow | Result | Evidence and limits |
| --- | --- | --- |
| Baseline and lifecycle | Pass for exercised path | Actual Electron startup registered Ctrl+Shift+Space with zero windows. Baseline second-instance callback opened an assistant with glintAPI. Post-change tests used the real tray menu callbacks to open, hide, restore and exit; minimized Settings restored. All six tabs opened. Green accent and encrypted fixture key survived process restart. No physical system-tray click, shortcut keypress or full second-process lock contention was simulated. |
| Settings and credential handling | Pass | Invalid model update rejected; assistant was denied settings access; settings read omitted the raw credential. Restart used encrypted data and legacy plaintext migrated, preserving accent. A damaged file showed a renderer alert and remained byte-for-byte unchanged after a refused save. The original user profile was not opened. |
| System Details | Pass for available fields | Actual view rendered the OS hostname. CPU matched Node's model, version matched Electron's application version, and the host returned GPU data. RAM and scaling matched native values. Physical resolution is derived from rounded logical dimensions and scale. OS/CIM timeout fallback is code-inspected; no real adapter was disabled for testing. |
| Screen capture | Pass for decoding and restoration; visual exclusion partially verified | Captured a real desktop PNG, decoded it via nativeImage, and checked window opacity during capture and restoration afterward. With an empty source list injected, IPC rejected and opacity returned to the previous value. Visible widget and overlay also reached zero opacity at source enumeration. Pixel-by-pixel exclusion against a calibrated reference desktop remains open. |
| L1 guidance | Pass with model fixture | A typed goal went through the Send button. The actual response appeared in .response-text. Missing key returned before network use. A fixture clarification reached the same route and a 403 returned failure. Reset during a held request aborted it and left currentGoal empty. No real Gemini inference or semantic judgment was assessed. |
| Timers and reminders | Existing reminder path passed; standalone timer absent | Real 120-second delay transitioned Active → Idle and invoked the native notification show method. Resume returned Active, Snooze returned Idle, and completion archived the session with no screenshot. Native toast visibility, delivery policy and clicking its action buttons were not witnessed. No user-created countdown exists to start or pause. |
| L2 discovery | Failed on this host | Two application runs found no accessible target via desktop-root search. An independent run of the final production locator confirmed label lookup false and controlled handle lookup true. A separate diagnostic enumerated eight root windows, none belonging to the controlled fixture PID. Direct FromHandle returned the named enabled button with a finite, on-screen rectangle. A packaged interactive Windows run is needed to distinguish session visibility from locator scope. |
| L2 guidance after lookup | Partial, handle-assisted | A two-step local model plan displayed a native widget and non-focusable overlay. The real UIA button, reached by the test handle, supplied the rectangle. Widget position moved within a one-DIP rounding tolerance. Pause hid controls, resume restored guidance, and a Windows Forms PerformClick changed the accessibility name. The next polling cycle found the new label. A fixture completion response destroyed the widget. A separate 403 during initialization returned an error and closed the widget. Physical pointer hit-testing remains unverified. |
| L3 execution | Absent | No executor, action permission prompt or OS-action result exists. An unknown action envelope was rejected before a model call. “Open Task Manager” exercised guidance; the assistant did not launch Task Manager. |
| Future voice ingress | Pass for simulated input | Typed and source-tagged final transcripts for “Open Task Manager.” and “பணி மேலாளரைத் திறக்கவும்” produced identical prompts per language through the production L1 executor. Tamil text survived unchanged. Blank requests, unknown sources and partial voice envelopes returned failure before model use. No microphone, pronunciation, recognition, Tanglish accuracy or speech provider was tested. |

## Mixed-DPI regression and diagnostic evidence

The primary display reported 1463 × 915 logical units at 175%. The secondary display began at (1463, 82) and reported 1920 × 1080 at 100%. An initial secondary-monitor run failed with an off-screen rectangle. Comparing Win32 GetWindowRect against UIA isolated two coordinate hazards: the Windows Forms test target needed DPI-aware positioning, and the Windows PowerShell UIA reader itself returned virtualized coordinates. Correcting fixture placement alone still failed.

On the diagnostic target, the unaware reader returned x=4634, y=440 with width=532 and height=247. With the shared per-monitor DPI setup, UIA returned x=2648, y=251 with width=304 and height=141, matching Win32 bounds (2648, 251)–(2952, 392). The production overlay now uses the target display's window bounds and native conversion. The desktop suite asserted the rendered center landed on the secondary display and compared it with the native control center on the handle-assisted path. It passed with a two-physical-pixel tolerance.

Representative console results (test fixtures only):

    PASS fresh / native system information displayed
    PASS fresh / PNG decoded and original opacity restored on success and capture failure
    PASS fresh / failed L2 initialization returns an error and closes the widget
    PASS fresh / highlight center moved onto secondary display
    PASS restart / saved preference and encrypted credential usable after launch
    PASS legacy / saved preference and encrypted credential usable after launch
    PASS reminder / two-minute inactivity, native notification request, resume, snooze and completion
    PASS corrupt / damaged profile preserved and error visible

## Coverage gaps

Real model availability, primary-versus-target display capture, physical overlay hit-testing, suspend/resume, display hot-plug, OS notification policy, packaged install, screen-reader navigation and timed first-use comprehension need dedicated runs. The interactive harness exercises renderer buttons and native menu handlers without physically operating the Windows notification area. Component-level and fixture evidence should be retained with these qualifications when assessing release readiness.
