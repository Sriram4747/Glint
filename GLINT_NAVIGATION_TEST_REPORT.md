# Windows Settings navigation test report

**November 21, 2026 · Windows 11 26H2 · build 26300.9974**

## File Explorer extension

The shared suite passed **256 automated cases** across both adapters. Explorer additions covered English and Tamil requests, final transcripts, redirected local folders, duplicate requests, launch errors and unverified dispatch, ambiguity, missing folders, unsafe path forms, and file operations. Requests such as `Show me the latest PDF in Downloads` and `நான் download பண்ண file-ஐ காட்டு` received a local folder-browsing reply. Those requests made no launch, screen capture or model call.

`npm run typecheck`, `npm run build`, and `npm run test:desktop` passed on the extended build. The five Settings demo requests each dispatched the original URI. Bluetooth, Display, Sound and Windows Update headings were observed again on the desktop. Desktop interaction interrupted the new Wi-Fi heading check. The original milestone below records the verified Wi-Fi heading for that same URI.

| Live Glint request | Windows Shell result |
| --- | --- |
| `Open File Explorer.` | This PC |
| `Where are my downloaded files?` | Downloads |
| `Show me my Documents.` | Documents |
| `படங்கள் கோப்புறையைத் திறக்கவும்.` | Pictures |
| `Show me the latest PDF in Downloads.` | Local reply. Zero Explorer and model calls. |

Glint submitted each request through the built goal editor and Send control. The verifier compared the resolved folder identity with a live Explorer view. The title check used window names without reading folder contents. The Shell helper returns a status token, and unverified dispatch has separate user-facing wording.

### Explorer voice tests

Both runs played synthesized speech through speakers into the actual default microphone and used local Whisper. Windows Speech generated the English clip. A speech service synthesized the generic Tamil test sentence. Only that generic sentence was sent to the service. Glint’s recording, transcription, navigation and verification stayed local.

| Language | Reviewed command | Observed location |
| --- | --- | --- |
| English | Whisper returned `Open my downloads.`. The transcript was sent as recognized. | Downloads |
| Tamil | Recognition varied across the synthesized clips. The presenter path corrected the transcript to `படங்கள் கோப்புறையைத் திறக்கவும்.` before sending. | Pictures |

Both passing runs verified microphone-track cleanup, cancellation and zero launches before Send. Each produced one verified Explorer launch and zero Gemini calls. The Tamil command needed an edit in the tested recordings. Human speech was outside these fixture runs.

### Reproduce the Explorer checks

Build Glint and use the relevant scenario. Supply short PCM WAV clips for the physical microphone tests.

```powershell
npm run test:navigation -- --live explorer
npm run test:navigation -- --live downloads
npm run test:navigation -- --live documents
npm run test:navigation -- --live pictures
npm run test:navigation -- --live latest-pdf

node tests/desktop/voice.cjs en C:\path\to\open-downloads.wav --physical --explorer
node tests/desktop/voice.cjs ta C:\path\to\open-pictures.wav --physical --explorer --review
```

## Windows Settings milestone

The sections below record the original Windows Settings verification. The adapter extension retains the same catalog and five demo destinations.

## Automated regression

| Suite | Executed | Passed | Failed |
| --- | ---: | ---: | ---: |
| New navigation suite with the Windows launch fixture | 221 | 221 | 0 |
| Built Glint with real Windows launcher and typed submissions | 6 | 6 | 0 |
| Built Glint with real Windows launcher and local Whisper | 4 | 4 | 0 |
| Separate desktop check of each allowlisted URI | 20 | 20 | 0 |
| **Total navigation checks** | **251** | **251** | **0** |

The new suite defines 221 fixture cases and eight live scenarios. Six live scenarios were run, with Bluetooth and Sound verified through the voice runs. Each catalog destination is exercised with direct and alternate English text, Tamil text, final English and Tamil transcript payloads, an exact URI assertion, a choice between pages, an unsupported explanation, launch failure followed by retry, and a repeated request. Cross-cutting cases cover the mixed-language examples, missing page, partial voice payload, forgery, command and URI text, concurrent calls, the assistant-only IPC boundary, L2 priority, and editable typed input with explicit Send. No unexpected launches or incorrect URI mappings were observed in the final suite. Screen capture and Gemini calls were both zero in the native test paths.

## Build, typechecks and existing desktop regression

`npm run build` and `npm run typecheck` passed. The existing `npm run test:desktop` passed its fresh, restart, legacy, reminder and corrupt-profile phases. It exercised the tray and window lifecycle, screenshots, L1 and controlled L2 guidance, settings persistence and recovery, and the two-minute reminder. The L2 UI Automation fixture required its known native control handle. The desktop suite used its existing local Gemini responses.

The existing file-backed Whisper-to-guidance regression passed separately for English and Tamil. Both runs exercised editable review, cancellation, microphone track release, a simulated Gemini error, retry and equivalent guidance prompts from typed and voice input.

## Actual Windows desktop

For each of the 20 catalog URIs, an Electron probe called the real Windows launcher. The visible heading in the selected Windows Settings window was checked independently. The exact headings and URI pairs are listed in [the navigation catalog](GLINT_NATIVE_NAVIGATION.md). Early runs inside the sandbox could return without changing pages. Those results were rerun in the interactive desktop session, and the final counts require the observed heading.

The following six cases used the built Glint renderer, its goal editor and the normal Send control with an isolated profile. The Windows launcher was real. The headings were read from the visible Settings window. For the repeat case, the second submission arrived through the existing assistant IPC within the suppression window, and the launcher trace recorded one OS request.

| Case | Input and starting state | Observed outcome |
| --- | --- | --- |
| Cold Wi-Fi | `Open Wi-Fi settings.` with no Settings window | Network & internet › Wi-Fi |
| Warm Display | `Take me to display settings.` from the Wi-Fi page | System › Display |
| Warm Windows Update | `Open Windows Update.` from the Display page | Windows Update |
| Rapid repeat | Two Windows Update requests with Settings already open | One real launcher call. The heading stayed at Windows Update. |
| Ambiguous | `Open Wi-Fi or Bluetooth settings.` | Glint asked which page to open. Zero launcher calls. Windows Update stayed visible. |
| Negated | `Don't open Wi-Fi settings.` in a clean profile | The existing guidance route reached its API-key prompt. Zero launcher calls. Windows Update stayed visible. |

The built app reached all five demo pages across typed and voice tests. The 15 other destinations were verified through the real URI probe and through Glint’s launch fixture. Windows controls and preferences were left untouched.

## Microphone and local Whisper

| Language and input source | Reviewed submission | Observed heading |
| --- | --- | --- |
| English, physical microphone with synthesized speaker playback | `Open Bluetooth settings.` matched the recording and was sent unedited. | Bluetooth & devices › Devices |
| English, Chromium file-backed microphone | Same command and exact transcript. | Bluetooth & devices › Devices |
| Tamil, physical microphone with a Tamil speech clip played through speakers | Whisper produced Tamil script with substitutions. The draft was edited to `ஒலி அமைப்புகளைத் திறக்கவும்.` and sent. | System › Sound |
| Tamil, Chromium file-backed microphone | Whisper produced Tamil script with a word substitution. The same edited draft was sent. | System › Sound |

Each run checked that cancellation stopped the tracks, the launch trace was empty until Send, a second Send click did not launch again, and the native route made zero Gemini calls. The physical tests used the default microphone. The Tamil playback clip contained a different sentence, so the edited draft verifies the Tamil navigation route and transcript review. Human-spoken demo lines and recognition of the spoken Tamil Sound command remain untested. The English stimulus was generated locally with Windows Speech. [Tamil stimulus and reference transcript](https://github.com/gnani-ai/text-to-speech/blob/master/README.md)

### Representative output

```text
PASS live wifi / dispatched ms-settings:network-wifi; inspect the Windows Settings heading
PASS live repeat / dispatched ms-settings:windowsupdate; inspect the Windows Settings heading
PASS live unsupported / no OS launch
PASS en physical microphone via speaker playback / native launch ms-settings:bluetooth
PASS ta physical microphone via speaker playback / native launch ms-settings:sound
```

## Reproduce

```powershell
npm run typecheck
npm run build
npm run test:navigation
npm run test:desktop

# Choose wifi, bluetooth, display, sound, update, repeat, ambiguous or unsupported.
npm run test:navigation -- --live wifi

# Supply short PCM WAV files. Omit --physical for Chromium file-backed capture.
node tests/desktop/voice.cjs en C:\path\to\open-bluetooth.wav --physical --navigation
node tests/desktop/voice.cjs ta C:\path\to\tamil-sample.wav --physical --navigation
```

For live checks, close Windows Settings before the Wi-Fi run and leave it open for a different destination. Inspect the Windows heading after each command. The English voice WAV should say “Open Bluetooth settings.” The Tamil fixture uses speech in Tamil, verifies a Tamil transcript and edits the draft to the Sound command. Run `npm run setup:voice` first if the local runtime or model is missing.

## Remaining limits

- The application reports OS dispatch and explicit launch errors. Exact page verification uses the visible Windows heading. Hardware, policy and Windows version determine availability on other PCs.
- The activation hotkey could not register during this desktop run. Glint’s tray Open Assistant action was used in the test profiles and is the demo fallback.
- The localized intent rules match common opening phrases and catalog aliases. Requests beyond those rules can still use the existing Gemini guidance path.
