# Native Windows navigation

Glint opens Windows Settings pages and File Explorer folders locally from the assistant’s input box. Type a request or record in English or Tamil, review the editable transcript, then press **Send** or **Enter**. Reopen Glint from its tray menu to see its response after the destination takes focus.

## Supported destinations

The headings below were observed on Windows 11 26H2, build 26300.9974. The URI definitions are in [Microsoft’s Windows Settings documentation](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings).

| Destination | URI | Observed Windows heading |
| --- | --- | --- |
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

The Explorer adapter resolves known folders through Electron’s `app.getPath`. It checks that the destination is a directory and dispatches it with `shell.openPath`. This PC uses a fixed Shell namespace destination. A read-only helper checks the folder identity of open Explorer views against the resolved location. Glint confirms an exact match or reports that Windows received the request. A missing folder or explicit launch failure produces a retryable error. [Electron special directories](https://www.electronjs.org/docs/latest/api/app/#appgetpathname) · [Electron Shell launch](https://www.electronjs.org/docs/latest/api/shell/) · [Windows Shell folder identity](https://learn.microsoft.com/en-us/windows/win32/shell/folderitem-path)

## Routing and execution

1. Typed text goes straight into the assistant draft. For voice, the recorder converts audio to mono PCM WAV and sends it to local Whisper through `voice:transcribe`. The result fills the editable draft. Send invokes `goal:execute` for either input source. The main process validates the sender, input source and text before classification.
2. `NativeActions` normalizes the request and passes the whole opening target to each adapter. An adapter resolves the complete destination against its own aliases. Settings accepts phrasing such as `Open the Wi-Fi settings page in Windows Settings`, `Show me the Display page`, and `Open Windows Settings to the Bluetooth page`. Explorer accepts a known folder in phrasing such as `Open File Explorer to my Documents folder`.
3. `Open Settings`, `Open Downloads or Documents`, and other recognized choices produce local clarification. File search and file operations receive a local folder-browsing reply. Guidance runs when the router finds no supported direct action. The conversational response or floating visual widget displays the reason. Native actions take priority even when Standard visual guidance is enabled.
4. On Windows, sending a supported request ends active guidance and invokes the selected adapter. The dispatcher suppresses an immediate repeat of the same successful action for two seconds. A rejected launch can be retried.

| Adapter | Permissions | Launch and verification |
| --- | --- | --- |
| Windows Settings | Standard desktop session and Windows access to the page | Electron opens a static `ms-settings:` URI from the catalog. Glint reports dispatch. Desktop checks verify the heading separately because Windows may accept a URI that policy or hardware prevents it from displaying. |
| File Explorer | Standard desktop session and access to the selected local known folder | Electron launches the known folder. The helper checks for that exact location in Explorer without a screenshot and returns a status token. |

A future adapter registers its own intent vocabulary, allowed actions, permission checks, execution and verification. The shared parser, IPC channel and launcher coordination stay the same.

## Running build

`npm start` runs Electron Vite preview, which builds the workspace before launch. Glint displays the running bundle fingerprint in **System Details → App Version and Build** and logs it at launch. When a launch finds a Glint tray process from this workspace and the bundle on disk has changed, the tray process restarts and reopens the assistant. Launching the same build reuses the process. A tray process from a version predating this check needs a one-time **Exit** before starting the new build.

## Security boundary

- `goal:execute` remains restricted to the registered assistant window’s trusted main frame. The preload exposes goal submission with the existing context isolation, sandbox and window navigation restrictions.
- The Settings adapter resolves a destination defined in `settings-destinations.ts` and sends its static URI to Electron’s `shell.openExternal`.
- Explorer accepts only app-owned destination identifiers. It opens the current user’s OS-resolved directory and accepts redirected local folders. Drive roots, UNC paths, absolute paths supplied by the user, and relative paths are outside the allowlist. The helper receives the directory as data through a process environment variable and returns only a status token.
- Native navigation and recognized file-related replies need no Gemini key, screen capture, network model call or elevation. Explorer reads the location needed for verification. It does not enumerate, inspect or send files or file lists.
- The native capabilities open pages and folders. They do not change Windows preferences or perform file operations. Individual-file lookup and launching are deferred. A future file launcher should present ambiguous matches for selection and require confirmation of the exact file before launch.

## Git history

`d7eb7e7` and the earlier reflog revision `014dc8b` contain generic Electron handlers that passed renderer-requested URLs to `shell.openExternal`. The checked-in guidance flow used Gemini instructions and later gained local UI Automation to locate targets and advance guidance. No `ms-settings:` catalog or natural-language direct Settings router was found in the available branches or reflog. `28210d4` removed the generic external-link handlers when it hardened renderer navigation and IPC. `736bd4d` added local Whisper and the shared typed/final-transcript submission. This implementation keeps those boundaries and uses Electron’s launcher only for main-owned Settings URIs.

`190a249` introduced the allowlisted Settings launcher. `883d5d7` moved it behind the shared dispatcher alongside File Explorer while preserving native-first routing. A destination phrasing miss could still reach L2 in that build. The current parser handles the reproduced contextual phrasing without relaxing the allowlist.

The local checkpoint `glint-before-native-navigation-20261121` points to `84dc7fb`.
