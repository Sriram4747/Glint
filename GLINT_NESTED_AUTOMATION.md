# Glint nested Windows automation

Glint uses its existing native dispatcher and Windows planner to reach nested Windows controls. The exact request “How to enable dynamic refresh rate for my display?” runs locally without a Gemini key. Glint opens Settings, verifies the Display heading, activates the observed Advanced display link, verifies the new heading and inspects the refresh controls for the selected display. It highlights the Dynamic refresh rate switch when Windows exposes it, and reports the current state and availability.

## History and checkpoint

| Revision | What the available Git history shows |
| --- | --- |
| `014dc8b`, `d7eb7e7` | The original visual guidance used the overlay for rendered targets. The renderer could also request an external Shell launch. |
| `471d0d5` | `guidance-session.ts` gained a local plan cursor and checked for the next target using UIA before asking the vision model to verify progress. |
| `8cdb11f` | `accessibility-provider.ts` searched a window, its descendants and popup candidates. It ranked named controls and observed patterns, visibility, disabled state and physical bounds. `overlay.ts` positioned the highlight. The session advanced from observations after user interaction. |
| `28210d4` | The guidance refactor removed the generic renderer-driven Shell launcher and moved UIA lookup into `resources/find-control.ps1`. It retained local guidance progression, DPI-aware geometry and the overlay. |
| `190a249`, `883d5d7`, `c4ad400` | Native verified Settings URIs and Explorer navigation were introduced and kept ahead of guidance. |
| `14fbc43` | The Windows planner could compose tool calls. Settings verification stopped at a page heading, and explicit UIA activation in this path was limited to Explorer tab selection. |

The available branches and reflog contain historical automatic **progress detection** and control discovery. They do not contain an earlier automatic Settings activation loop. That distinction accounts for why those builds could advance guidance while this request stopped after opening Settings. The new executor reuses the verified native launches, scoped UIA lookup, stale-element recovery and DPI-aware overlay, and adds verified UIA interactions for nested pages. The local branch `codex/nested-automation-checkpoint` points to `14fbc43`.

## Execution flow

1. Typed requests and reviewed English or Tamil transcripts use the same assistant IPC. The native action catalog still handles exact page and known-folder opens. The same `WindowsAgent` handles recognized nested targets locally and gives the configured planner the same tool registry for unfamiliar requests.
2. Native Windows launchers start or navigate the app. For nested Settings requests, the native verifier checks the expected heading and foreground context. It can retry the Windows Shell once if the original launch fails or does not take focus.
3. `WindowsUia` and `resources/windows-uia.ps1` inspect the foreground accessibility tree. The driver accepts child or descendant scope and exact accessible names, control types, automation IDs and ancestor context. It recognizes Settings content inside an ApplicationFrameHost window. Observation references bind the control to the window handle, process, runtime identity and parent hierarchy.
4. The driver re-resolves the element before taking action. It checks the live identity, enabled state for activation, scroll viewport, physical bounds and foreground window. A stale element can be re-observed within a bounded retry. Scrolling uses `ScrollItem` or the enclosing scroll provider and is followed by a fresh bounds check.
5. Glint verifies the new page heading, selected state, or expected dialog before continuing. The hyperlink and card routes use `Invoke`, safe tab selection uses `SelectionItem`, and refresh-rate list inspection uses `ExpandCollapse`. The worker reads exposed selection, toggle and Value properties where applicable. For Mouse Properties it verifies a new foreground legacy dialog by class, title, executable and recognizable content. Explorer Properties uses a fixed Shell verb on the exact previously selected item and checks a newly opened dialog.
6. The overlay uses verified physical UIA bounds and the existing per-monitor DPI conversion. Glint clears the highlight when another goal begins or the current goal is cleared. Selecting **Cancel** stops the active run. A run has a 65-second deadline and the hosted planner has at most 14 decisions.

## Planner and permissions

The registry adds `settingsTarget`, `inspectUi`, `findUi`, `readUi`, `revealUi`, `selectUiTab`, `highlightUi` and `fileProperties`. It keeps the existing Settings, Explorer, file search and window tools. The configured planner gets a compact observation of allowed properties and can replan after failures. File properties, UI lookups and tab selection use current-run references. Generic exact-name search checks the user’s wording and returns matches for disambiguation. A page launch is intermediate when a nested route is active. Guidance is available when a supported automation outcome cannot be verified.

Automatic navigation can open apps in the native catalog, follow known page links, select supported app tabs, scroll, highlight or read exposed state. The settings transition catalog defines what actions are allowed and the destination that must be verified. The general UIA driver can also inspect other accessible foreground applications. Additional app-specific activations require a navigation rule and a verifiable destination. There is no mouse-coordinate dispatch or general executable launcher.

An explicit “Enable Dynamic Refresh Rate” or “Turn off Dynamic Refresh Rate” can prepare a pending change when Glint can verify the enabled switch, its state and the selected display. The user must send “Confirm Dynamic Refresh Rate” within two minutes. Glint reopens the route, checks the display and current switch state again and uses `Toggle` only for that confirmed change. It reports completion after UIA reads the expected new state. A question beginning “How to enable” is read-only. Other Settings controls remain read-only through these tools. Windows builds with a Dynamic entry in the refresh-rate list can be inspected and highlighted without selecting a new rate. If the provider does not expose enough evidence to determine availability, Glint reports that limitation. [Microsoft Dynamic Refresh Rate guidance](https://support.microsoft.com/en-gb/windows/hardware/display-graphics/change-the-refresh-rate-on-your-monitor-in-windows)

`automation-audit.jsonl` in Glint’s user-data directory records the run ID, recognized goal category, planned operation, safe target label, verification and retry or fallback reason. The trace avoids raw goals, local paths, device names, unrelated window titles, screenshots and document contents.

See [UI Automation control patterns](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview) and the [nested automation test report](GLINT_NESTED_AUTOMATION_TEST_REPORT.md).
