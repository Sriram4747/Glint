# Glint nested Windows automation test report

Windows 11 26H2, build 26300.9974, interactive desktop, one display at 175% scaling. Tests launched the built Electron app with temporary profiles. The Settings cases ran locally without Gemini or screenshot guidance. Explorer search cases used deterministic planner decisions and real Windows Shell operations on test files. The test snapshots captured outcome and geometry without retaining screen images or device names.

The final nested desktop run passed all 18 cases. The seven deterministic nested cases and the existing build, type, planner, navigation, automation, desktop, voice and build-reload checks also passed.

## Dynamic Refresh Rate

The test entered the exact request **How to enable dynamic refresh rate for my display?** in Glint’s assistant text field and selected **Send**. It started with Settings closed.

| Step | Observed evidence |
| --- | --- |
| Launch Settings | The native Settings window was observed after the home launch. |
| Go to Display | The native Display route was verified against its visible heading and foreground window. |
| Open Advanced display | Glint found the enabled UIA action inside the Display page’s Related settings card. It invoked that live element and verified the Advanced display heading in the same window. |
| Inspect Dynamic refresh rate | Windows exposed a visible, enabled Toggle control for the selected display. UIA read **Off**. |
| Highlight | The click-through overlay bordered the observed switch. The rendered center matched the native UIA target center within the test’s three-physical-pixel tolerance at 175% scaling. |
| Verify read-only result | The switch stayed **Off** across the observations. The run issued no Toggle or refresh-rate selection and used no guidance calls. |

This display exposed an enabled Dynamic refresh rate switch. The disabled-control and legacy list without a Dynamic choice were tested deterministically. The confirmation route was exercised with a simulated control state change. The live suite made no setting changes.

## Other live Windows checks

| Request | Verified route and target |
| --- | --- |
| Where can I find screen resolution? | Display → Display resolution combo box. |
| Show me the advanced screen details. | Display → Advanced display → Display information. |
| மைக்ரோஃபோன் அனுமதிகள் காட்டு. | Privacy & security → Microphone → Microphone access. Tamil final-transcript input. |
| Find my default audio output device. | Sound → Output → default audio output section. |
| Take me to Proxy settings. | Network & internet → Proxy. Highlighted the verified Proxy page heading. |
| Where are VPN connections? | VPN → VPN connections. |
| Find apps that start automatically. | Apps → Startup. |
| விண்டோஸ் புதுப்பிப்பு வரலாறு எங்கே? | Windows Update → Update history. Tamil final-transcript input. |
| Open advanced mouse settings. | Mouse → offscreen Additional mouse settings link → new Mouse Properties dialog → Buttons tab. The test dismissed the dialog without applying changes. |
| Locate the Display orientation control in Windows Settings. | The existing planner opened Display, inspected its actual UIA tree, resolved the observed combo box, read its properties, verified visibility and highlighted it. |
| Downloads folder எங்கே இருக்கு? | Native Downloads adapter verified the Explorer location. Tamil final-transcript input. |
| Go into the glint archive folder. | Metadata search matched a test folder two levels under Documents. Explorer verified the exact path. |
| Find the glint manual PDF in Downloads. | Local metadata search returned the test PDF. |
| Select glint manual.pdf in File Explorer. | Explorer verified the selected file’s exact path. |
| Open Properties for glint manual.pdf. | The fixed Properties verb opened a new Explorer dialog for the selected PDF. The test verified that its contents were unchanged and dismissed the dialog. |
| Switch to the test Explorer tab. | The harness opened a second tab, verified the target tab was inactive, then verified that Glint selected it. |
| சமீபத்தில் திருத்திய glint review ஆவணத்தை காட்டு. | Modified-date ordering returned the newer test document. Tamil final-transcript input. |

The Settings highlight checks compared the renderer’s outline with freshly verified UIA bounds. The tests used accessible controls in the running OS.

## Failures found and fixes

- Initial UIA hit-testing assumed XAML card content was a descendant of its transparent action button. In Settings, the label could be a sibling. Verification now checks accessibility visibility, scroll viewport and the foreground native window at the control bounds. Interactions still use UIA patterns.
- Initial launches could verify a Settings heading behind the Mouse Properties probe dialog. Nested launches now require foreground verification and allow a bounded Shell retry. The harness closes the dialogs it opens.
- The Network & internet page exposed Proxy as an invokable list item under its page list. An earlier selector missed it. The verified Proxy heading is the target for the page request.
- Explorer could select the correct item in a window that had yet to come forward. Properties now resolves the verified selection through the Shell and verifies a newly opened dialog for that item. The tab test uses a uniquely named fixture and invokes Explorer’s verified New Tab control. This passed through the real second-tab transition without relying on foreground keyboard input.
- The available English WAV transcribes an instruction-only Bluetooth question. The voice test exercises the editable review step before submitting the native navigation command.

## Verification commands

```powershell
npm run build
npm run typecheck
npm run test:planner
npm run test:navigation
npm run test:automation
npm run test:automation:windows
npm run test:nested
npm run test:nested:windows
npm run test:desktop
node tests/desktop/voice.cjs en resources/whisper/test-audio/bluetooth-en.wav --navigation --review
node tests/desktop/voice.cjs ta resources/whisper/test-audio/sample-ta.wav --navigation
node tests/desktop/build-reload.cjs
```

The deterministic nested cases cover a stale element retry, ambiguous matches, a missing destination after Invoke, a disabled control, a legacy list without a Dynamic option, one-time confirmation, cancellation, forged UI references and early completion. The existing navigation suite passed 301 cases. The desktop regression covered real UIA guidance, window and overlay behavior, persisted settings, the two-minute reminder and damaged-profile recovery. Voice uses file-backed microphones with the local Whisper runtime and verifies editable review, cancellation, a single verified native launch and no Gemini calls.

The live planner tests used a deterministic model response fixture. That isolates the Windows observations and effects from model availability. They do not measure how a hosted model handles arbitrary phrasing.
