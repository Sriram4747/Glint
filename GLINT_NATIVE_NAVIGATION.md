# Native Windows navigation

Glint navigates Windows and searches personal folders from the assistant’s input box. Type a request or record in English or Tamil, review the editable transcript, then press **Send** or **Enter**. Reopen Glint from its tray menu to see its response after the destination takes focus.

## Supported destinations

The headings below were observed on Windows 11 26H2, build 26300.9974. The URI definitions are in [Microsoft’s Windows Settings documentation](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings).

| Destination | URI | Observed Windows heading |
| --- | --- | --- |
| Windows Settings | `ms-settings:` | Settings window |
| Wi-Fi | `ms-settings:network-wifi` | Network & internet › Wi-Fi |
| Bluetooth | `ms-settings:bluetooth` | Bluetooth & devices › Devices |
| Display | `ms-settings:display` | System › Display |
| Sound | `ms-settings:sound` | System › Sound |
| Windows Update | `ms-settings:windowsupdate` | Windows Update |
| Installed apps | `ms-settings:appsfeatures` | Apps › Installed apps |
| Default apps | `ms-settings:defaultapps` | Apps › Default apps |
| Storage | `ms-settings:storagesense` | System › Storage |
| About PC | `ms-settings:about` | System › About |
| Microphone privacy | `ms-settings:privacy-microphone` | Privacy & security › Microphone |
| Network & internet | `ms-settings:network-status` | Network & internet |
| VPN | `ms-settings:network-vpn` | Network & internet › VPN |
| Printers & scanners | `ms-settings:printers` | Bluetooth & devices › Printers & scanners |
| Mouse | `ms-settings:mousetouchpad` | Bluetooth & devices › Mouse |
| Notifications | `ms-settings:notifications` | System › Notifications |
| Clipboard | `ms-settings:clipboard` | System › Clipboard |
| Multitasking | `ms-settings:multitasking` | System › Multitasking |
| Background | `ms-settings:personalization-background` | Personalization › Background |
| Date & time | `ms-settings:dateandtime` | Time & language › Date & time |
| Startup apps | `ms-settings:startupapps` | Apps › Startup |

## File Explorer

| Action | Example request | Destination |
| --- | --- | --- |
| Open File Explorer | `Open File Explorer.` | This PC |
| Open Downloads | `Where are my downloaded files?` or `Downloads folder எங்கே இருக்கு?` | Current user’s Downloads |
| Open Documents | `Show me my Documents.` | Current user’s Documents |
| Open Pictures | `படங்கள் கோப்புறையைத் திறக்கவும்.` | Current user’s Pictures |

Explorer supports named personal folders, file metadata search and opening a found item’s containing folder. Search uses local Desktop, Documents, Downloads, Pictures, Videos, and Music paths. Folder-name searches also inspect nearby directories in the user’s profile. Windows resolves Captures and Screenshots through its known-folder API, including local redirections. The scan has time, depth and entry limits and skips symlinks and hidden or system locations. A search can return several candidates and ask the user to select one by number. The Explorer helper checks the actual folder and, for a reveal request, the selected item. [Electron special directories](https://www.electronjs.org/docs/latest/api/app/#appgetpathname) · [Windows known-folder API](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath) · [Windows Shell folder identity](https://learn.microsoft.com/en-us/windows/win32/shell/folderitem-path)

## Routing and execution

1. Typed text goes straight into the assistant draft. For voice, the recorder converts audio to mono PCM WAV and sends it to local Whisper through `voice:transcribe`. The result fills the editable draft. Send invokes `goal:execute` for either input source. The main process validates the sender, input source and text before classification.
2. `NativeActions` recognizes exact Settings and known-folder requests and executes them without a model. `Open Settings` opens the app. Explicit choices such as `Open Downloads or Documents` produce a clarification. The dispatcher suppresses an immediate repeat of a verified action for two seconds.
3. For unfamiliar requests, the configured Gemini model receives the goal, tool descriptions and observations. It proposes one validated tool call at a time and can change its plan after a failure. File and UI references come from Glint’s observations for the current request. The planner receives references and relevant metadata. Local paths, file contents, window titles and screenshots stay on the device during automation. The automation run is bounded to nine planner turns and 65 seconds. A local folder-name search is also available without a configured key.
4. Glint builds completion messages from observed tool outcomes. If automation cannot complete the goal and guidance is available, Glint reports the reason and uses the configured guidance mode. The execution trace is in `automation-audit.jsonl` in Glint’s user-data directory. It records tool names and statuses with no prompts, local paths or file contents.

| Tool | Input | Outcome and constraints |
| --- | --- | --- |
| `settings` | Catalog ID | Opens an app-owned Settings URI. Windows UI Automation checks the visible page heading or the Settings window for a bare app request. A second Shell launch is attempted after a launch or verification failure. |
| `search` | Name clue, file type, optional scopes, sort order and date filter | Finds candidates from directory names and file metadata. Returns request-scoped references, rank, size, timestamps and search limits. |
| `locate` | Exact absolute location provided in the request | Resolves an existing local file or folder inside an approved personal folder. |
| `explore` | Observed file/folder ID or This PC, navigation mode | Opens the folder, opens the containing folder, or reveals a file. Glint checks Explorer’s actual folder or selected item. |
| `show` | Observed file/folder IDs | Displays local results with names and metadata. |
| `findWindow`, `focusWindow` | Application/title clue followed by an observed ID | Discovers open windows and verifies that Windows brought the selected window to the foreground. |
| `findExplorerTabs`, `selectExplorerTab` | Tab name clue followed by an observed ID | Discovers accessible File Explorer tabs, selects one using UI Automation and verifies that it is selected. |

## Running build

`npm start` runs Electron Vite preview, which builds the workspace before launch. Glint displays the running bundle fingerprint in **System Details → App Version and Build** and logs it at launch. When a launch finds a Glint tray process from this workspace and the bundle on disk has changed, the tray process restarts and reopens the assistant. Launching the same build reuses the process. A tray process from a version predating this check needs a one-time **Exit** before starting the new build.

## Security boundary

- `goal:execute` remains restricted to the registered assistant window’s trusted main frame. The preload exposes goal submission with the existing context isolation, sandbox and window navigation restrictions.
- Tool names, enum values and arguments are validated in the main process. The model uses request-local references to select local results. PowerShell runs fixed scripts with arguments passed as data using Windows’ existing execution policy.
- The automation registry allows ordinary navigation and read-only inspection. Changing Windows preferences, launching an arbitrary executable or document, moving or deleting data, and sending anything outside the device are outside the registry. Revealing a file selects it in Explorer.
- Windows settings availability and UI Automation depend on OS version, display language, hardware and policy. A blocked, missing or unverified page is reported as a failed outcome.

## Validation commands

Run `npm run build` before the Electron suites. `npm run test:planner` checks structured decision validation. `npm run test:navigation` exercises native input and IPC. `npm run test:automation` covers the planner loop with model and Windows launch fixtures, and reads test files from an isolated profile. `npm run test:automation:windows` uses the real Settings and Explorer launchers and verifiers on the interactive Windows desktop, with a deterministic model fixture. To also exercise Gemini with synthetic requests, run `node tests/desktop/navigation.cjs --provider-live` with a configured project `.env`.

## Git history

`d7eb7e7` and the earlier reflog revision `014dc8b` contain generic Electron handlers that passed renderer-requested URLs to `shell.openExternal`. The checked-in guidance flow used Gemini instructions and later gained local UI Automation to locate targets and advance guidance. No `ms-settings:` catalog or natural-language direct Settings router was found in the available branches or reflog. `28210d4` removed the generic external-link handlers when it hardened renderer navigation and IPC. `736bd4d` added local Whisper and the shared typed/final-transcript submission. This implementation keeps those boundaries and uses Electron’s launcher only for main-owned Settings URIs.

`190a249` introduced the allowlisted Settings launcher. `883d5d7` moved it behind the shared dispatcher alongside File Explorer while preserving native-first routing. A destination phrasing miss could still reach L2 in that build. The current parser handles the reproduced contextual phrasing without relaxing the allowlist.

The local checkpoint `glint-before-native-navigation-20261121` points to `84dc7fb`.
