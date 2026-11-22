# GLINT implementation plan

**Review status — proposed, awaiting approval.** This plan starts from the stabilized Windows application described in GLINT_CURRENT_STATE.md. It covers unfinished work. Existing text input, Gemini guidance, named IPC, Windows-backed credential storage, the input contract and desktop regression suite are the starting point.

## Execution order and release priorities

| Order | Finding and user impact | Severity | Dependency | Estimated hands-on effort |
| --- | --- | --- | --- | --- |
| A | The original local source contained a provider key. Live model eligibility and response behavior remain unknown. | P0 before external testing | Credential owner and approved test account | Small, 0.5–1 engineer-day plus owner response |
| B | The desktop UIA root missed a visible control. Pre-existing controls can falsely advance a guide. Stalled verification repeatedly captures the screen. | P1, core L2 reliability | Current regression suite. Live acceptance also needs A | Large, 4–7 days |
| C | Guidance can capture a different monitor from the target. Installed toast actions, click-through and negative-origin geometry lack release evidence. | P1 before distribution | B's reliable target identity, Windows test host | Medium–large, 3–6 days |
| D | Tray-only onboarding, inaccessible floating controls, loose IPC result types and renderer state restoration make recovery hard to understand. | P1 usability, P2 maintainability | B's session states, C for installed acceptance | Medium, 2–4 days |
| E | No speech provider has been measured and current permission policy denies microphone access. | P2 engineering, required for voice | Approved data handling and D's input/status surface | Medium, 2–4 days plus evaluation data |
| F | No real audio path from microphone to a reviewed English goal. | First voice release | A, D, E. Ship after C qualification | Medium, 3–5 days |
| G | Tamil Unicode routing passed, but Tamil recognition, correction effort and control-name accuracy are unknown. | Second voice release | Working F and Tamil reviewers | Medium, 3–5 days plus speaker review |
| H | Mixed speech has no labelled corpus, scoring rules or language-switch evidence. | Third voice release | G and bilingual reviewers | Medium–large, 4–7 days plus corpus collection |

Estimates assume one engineer familiar with TypeScript/Electron and an interactive Windows desktop. Account provisioning, signing credentials and participant recruitment are external lead times. Begin A first. B's offline work and preparation of the C test hardware can proceed while the owner rotates credentials. Enable each language only after its own gate. L3 is outside these milestones.

## A. Restore trust in the live provider boundary

1. Have the credential owner revoke/rotate the previous key in the provider account and review activity. Account actions require the owner's authorization. Keep values out of source, issue bodies, test transcripts and logs. Configure the new credential through Settings or the main-process environment.
2. In a clean Windows test account, prepare a synthetic desktop without private windows. Submit “Show me how to open Task Manager” in Minimal and Standard. Record offered model ID, response status, elapsed time, accepted contract shape and the rendered result. Keep screen payloads and credential headers out of artifacts.
3. In src/main/services/ai.ts and the model selector in SettingsView.tsx, align choices and fallback order with the successfully exercised account models. Replace unmeasured speed/stability claims. Exercise 403, 404, 429, stalled response, malformed plan and cancellation with a local transport fixture. Preserve terminal rejection for bad authorization.
4. Add assertions for both recognized response formats, including completion with an empty next instruction. Keep the request budget observable as counts and durations.

**Exit** — owner records rotation, one real L1 instruction and one real L2 plan succeed on synthetic content, a denied key returns a visible failure, and stopping a request prevents late steps or extra network attempts. If account access is unavailable, retain the fixture result and mark live qualification outstanding.

## B. Make visual guidance progress verifiable

1. Start in tests/desktop/session.cjs and resources/find-control.ps1. Repeat the existing known-target scenario on the signed-in interactive desktop under ordinary privileges. Record root enumeration, whether the test PID was present, target count, bounds, duration and handle-assisted status. The audit found a visible element via its HWND while root enumeration returned eight windows and omitted the fixture PID.
2. Split the test verdict into native discovery and downstream rendering. Add a strict run that fails if the test-only known-handle lookup is needed. Keep the diagnostic run for hosts with restricted window enumeration. Never ship the test handle fallback.
3. In accessibility-provider.ts and find-control.ps1, carry an explicit target window identity from the selected application when available. Search that window and its owned popups; return distinct unavailable, ambiguous, disabled and offscreen results. Bound global scans and elapsed time. Treat duplicate labels or an unreachable/elevated target as a reason to ask the user or continue in text. Preserve read-only UIA behavior.
4. In guidance-session.ts, track the evidence for each displayed step: intended window, target, pre-step observation and expected transition. A next target already visible in the baseline cannot alone prove completion. On manual Next, record explicit user advancement. Compare before/after state or obtain confirmation when evidence is ambiguous.
5. Extract the transition decisions into pure functions with a session generation and explicit start, pause, resume, stop, verification and completion events. Keep service side effects in the existing orchestrator. Choose a finite retry/budget rule; for example, offer Retry after two consecutive provider failures. Preserve the user's current instruction and Stop while waiting.
6. Test duplicate labels across windows, a pre-visible next button, changed target, absent/elevated control, disabled/offscreen element, timer vs Next, reset during capture/UIA/model wait, pause/resume and stale notification callbacks.

**Exit** — a real supported Windows task advances only after its expected transition or explicit Next. A second fixture with both labels visible stays on step one. Stop clears the overlay, timers and widget and blocks stale updates. Repeated failure reaches a visible recoverable state with bounded requests. Record one strict native success separately from fallback coverage.

## C. Qualify display, capture and installed lifecycle

1. Start in services/capture.ts, services/overlay.ts and windows/{overlay,floating-assistant,assistant}. Carry the selected display through a session or identify it from a verified target. Match Electron source display_id before reporting metadata. Handle display removal or scale changes by clearing the old highlight and re-resolving the target.
2. Use controlled colored target and overlay markers. Assert the returned PNG contains the target marker and excludes every Glint marker. Check normal and failed capture, overlapping requests, pause during capture and windows closing or opening during capture. Check the native overlay rectangle against the target's screen-pixel bounds.
3. Test primary and secondary displays at different scale factors, a negative origin, and unplug/reconnect. Move the widget and assistant near each work-area edge. Exercise a real pointer click on a test button under the overlay and confirm a single callback. Verify no focus theft. Record expected/actual bounds and residual error in physical pixels.
4. Establish a Windows packaging target after reviewing dependency/signing requirements. Include the icon, find-control.ps1 and its enable-uia-dpi.ps1 dependency at paths resolvable outside an archive. Verify a standard-account install in a path with spaces. Set an appropriate Windows app identity for tray and toast behavior. Run fresh launch, duplicate launch, tray/shortcut activation, close, restore, quit and restart.
5. On the installed build, wait two minutes for an L1 reminder, click the toast and exercise available actions. Verify L2 pause and completion notifications under enabled notifications; test the in-app recovery path with Windows notifications disabled.

**Exit** — native target and overlay centers agree within two physical pixels on the supported matrix (proposed tolerance), click-through works, screen exclusion passes pixel comparison, and no surviving window is invisible after failed capture. Record monitor layout, scaling, Windows build, packaging method and notification delivery. A signed installer is a distribution gate if signing credentials are available; an unpackaged preview alone cannot close this phase.

## D. Make first use and recovery clear

1. In tray.ts, AssistantView.tsx and SettingsView.tsx, show the shortcut, first-use setup entry and the screen-sharing behavior before first submission. Preserve the existing tray workflow. Use completion, cancellation and paused status from the main session when restoring windows.
2. Give the widget's open action keyboard semantics and all controls accessible names. Verify Tab order, visible focus, Escape, Next and Stop with Narrator and keyboard only. Replace unavailable preference controls with clear status or implement them only after their product behavior is agreed. Decide separately whether startup registration or persistent positions merit OS integration.
3. Replace loose goal result/session types in preload/index.d.ts and the renderer with a shared discriminated result for success, interruption and error. Keep legacy string submission compatible. Centralize screen/session comparison in main if it eliminates transferring full images to the renderer; verify the existing resume banner behavior before moving it.
4. Run a timed first-use walkthrough on a clean profile. Record time to open, configure, request a guide and stop, plus each point where assistance was necessary. Repeat with an unavailable credential and provider timeout.

**Exit** — a first-time tester finds the assistant and submits a configured goal within two minutes; document setup time separately. A keyboard-only user can pause, resume and stop. After cancel, reopen and completion, the UI reflects the main-process state. Build, both typechecks and desktop regressions pass.

## E. Select a replaceable provider

1. Use src/shared/input.ts as the boundary. Build an evaluation harness for consented recordings outside production UI. Implement one adapter per candidate behind SpeechProvider. Do not include provider SDK types in the main goal API. Evaluate cloud or paid services only after approval.
2. Define the privacy and consent model before capture: destination, retention, recording indicator, stop/cancel behavior, deletion, and OS denial. Separate app consent from Windows microphone permission. Document offline behavior and costs per minute and per accepted final.
3. Establish separate English, Tamil and Tanglish datasets. Include at least 30 held-out task utterances per language cohort as an initial pilot, multiple speakers, quiet/noisy rooms, app names, negation, numerals and cancellations. Reserve speakers or utterances for held-out scoring. Store only consented material in its approved location.
4. Score finalization latency, intended task, critical Windows label preservation and correction rate. Report word error rate with language-specific normalization alongside task success. Agree proposed gates with product and native-speaker reviewers before examining held-out results.

**Exit** — a reviewable comparison names a provider or documents why none qualifies, with measured score, cost and privacy tradeoffs by cohort. Permission denial, cancellation, duplicate finals and offline errors pass the same adapter contract suite.

## F. English push-to-talk MVP

1. Wire one user-initiated microphone control into AssistantView. Track idle, requesting permission, listening, stopping, draft and error states. Authorize only the expected assistant frame, current capture request and audio permission. Keep camera, other origins, other windows and background requests denied.
2. Acquire a capture session ID. Render partials as transient text. A single final produces an editable draft; explicit Send invokes the existing goal:execute route with language and source metadata. Cancel, blur policy, device loss and app quit must release the microphone and discard late callbacks.
3. Add a fake provider for deterministic renderer tests; then exercise a real Windows microphone with English recordings and live utterances. Test rapid press/release, no speech, device unplug, permission revoked mid-capture, duplicate finals, cancellation and switching back to typing.

**Exit** — one explicit submission yields exactly one matching guidance intent. Partials, unsubmitted drafts and cancelled sessions yield zero guidance calls. Recording stops visibly and the OS device is released. Proposed English pilot gate: at least 90% intended-task accuracy, with zero unintended submissions; report p50/p95 finalization latency and set a release budget using E's measurements.

## G. Tamil

1. Add explicit Tamil language selection or a verified provider locale to the adapter. Preserve Tamil Unicode through partials, final, editing and submission. Agree reference transcriptions and acceptable variants with native speakers, including inflected commands and English app names embedded in Tamil.
2. Reuse F's controls and executor. Test Windows input method editing, composing text, line wrapping, selected text correction, permission errors and retry in Tamil mode. Keep labels usable where the target Windows UI is English.
3. Run the Tamil held-out set and at least one real microphone-to-guidance session on Windows. Compare to an equivalent typed Tamil goal. Record label preservation, correction effort, false submissions and latency independently of English.

**Exit** — native reviewer accepts transcription and correction UX, Tamil meets its agreed intended-task and named-control gates, and cancellation has zero submissions. A text-only parity pass cannot satisfy this milestone.

## H. Tanglish

1. Define supported forms before tuning: within-utterance Tamil/English code switching, English Windows label inside Tamil context, and romanized Tamil. Obtain bilingual references with permissible spelling/transliteration variants. Evaluate mixed speech on its own held-out set.
2. Use the same provider interface and reviewable draft. Preserve original control names. Offer clarification or editing for uncertainty. Do not silently translate or run a new desktop action based on ambiguous output.
3. Compare language selection and provider auto-detection on the same utterances. Report task accuracy, named-control preservation, correction frequency and p95 latency separately for each mixed form.

**Exit** — bilingual reviewers approve the agreed mixed-speech gate, critical control-name substitutions are surfaced for correction, and one accepted Tanglish final follows the already-tested input route. If the pilot misses its gate, retain text correction and keep the feature in evaluation.

## Feature disposition

| Decision | Features | Reason |
| --- | --- | --- |
| Retain | Tray and shortcut, text goals, system details, L1, human-operated L2, native inactivity reminders, local settings | Implemented workflows with concrete desktop coverage or existing users. |
| Improve | Window-scoped UIA, capture/display selection, packaging, provider failure messages, keyboard and screen-reader access | Observed failure, incomplete release evidence or visible usability gap. |
| Redesign incrementally | L2 progress inference, session presentation and first-use controls | Current state spans timers, windows and two services; labels can exist before the user acts. |
| Defer | L3 click/type/launch execution, general countdowns, OCR coordinate fallback, persistent conversation storage, wake word and spoken replies | No validated implementation or requirement for the reviewed-transcript MVP. Each needs its own product scope and safety or privacy design. |

## Per-phase handoff

Run npm run typecheck and npm run build after changes. On Windows run npm run test:desktop against that build. Record fixture substitutions, actual devices, provider mode and any unverified result in GLINT_TEST_REPORT.md. Add narrowly targeted tests for the named exit gates. Commit each completed phase separately. If a native, live-provider or language gate fails, keep its status open and record the failing scenario, remediation owner and repeatable check. Approval of this document is the starting dependency for roadmap implementation.
