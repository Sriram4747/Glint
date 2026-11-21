# Native Windows Settings navigation

Glint opens supported Windows Settings pages locally from the assistant’s input box. Type a request or record in English or Tamil, review the editable transcript, then press **Send** or **Enter**. Windows Settings takes focus when Windows opens the page. Reopen Glint from its tray menu to see its response.

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

## Routing and execution

1. The assistant sends typed text or a reviewed final transcript through `goal:execute`. The main process validates the sender, input source and text.
2. The local router normalizes Unicode, case and whitespace. It matches an opening phrase and the entire destination against English and Tamil aliases. Examples include `Could you open Wi-Fi settings?`, `Bluetooth settings எப்படி open பண்றது?` and `திரை அமைப்புகளைத் திறக்கவும்.`
3. `Open Settings` or a choice between supported pages produces a clarification prompt in Glint. Explanations such as `Show me how to open Bluetooth settings` and unsupported requests follow the existing guidance route. A supported request to open a page takes priority over both L1 and L2.
4. On Windows, sending a supported request ends active guidance and asks Electron main to open the catalog URI. An in-flight launch blocks another launch. An immediate repeat of the last successful dispatch to the same page is suppressed for two seconds. A rejected OS request returns an error and can be retried.
5. The response describes the request sent to Windows and directs the user to the Settings window. Windows may accept a URI even when hardware, build or policy prevents it from displaying the intended page. The test report records pages observed independently on the desktop.

## Security boundary

- `goal:execute` remains restricted to the registered assistant window’s trusted main frame. The preload exposes goal submission with the existing context isolation, sandbox and window navigation restrictions.
- The router returns a destination identifier defined in `settings-destinations.ts`. Electron’s `shell.openExternal` receives only the corresponding static URI.
- Native navigation needs no Gemini key, screen capture, network model call or elevation. Unmatched requests use the existing guidance configuration. Sending a request for Gemini guidance can include the current screen, as before.
- The native action opens a page only. Connecting to a network, pairing devices, changing privacy permissions, modifying preferences, checking or installing updates, running commands and opening arbitrary URLs are outside its scope.

## Git history

`d7eb7e7` and the earlier reflog revision `014dc8b` contain generic Electron handlers that passed renderer-requested URLs to `shell.openExternal`. The checked-in guidance flow used Gemini instructions and later gained local UI Automation to locate targets and advance guidance. No `ms-settings:` catalog or natural-language direct Settings router was found in the available branches or reflog. `28210d4` removed the generic external-link handlers when it hardened renderer navigation and IPC. `736bd4d` added local Whisper and the shared typed/final-transcript submission. This implementation keeps those boundaries and uses Electron’s launcher only for main-owned Settings URIs.

The local checkpoint `glint-before-native-navigation-20261121` points to `84dc7fb`.
