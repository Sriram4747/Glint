# Glint Round 1 MVP report

**Everyday Access | Your Computer. Your Language.** Glint lets a Windows user speak a goal in English or Tamil, correct the transcript, and get the next step in the existing assistant. The demo goal is to open **Bluetooth & devices** from Windows Settings Home. Starting revision `28210d4` is the recovery checkpoint.

## What changed

- The assistant’s microphone starts and stops on click. A visible status shows when it is opening the microphone, listening, or transcribing. **Cancel**, **Esc**, and hiding the assistant discard an in-progress recording. A recording stops after 25 seconds.
- English and Tamil share the existing goal box. A final transcript fills an editable draft. **Send** submits the reviewed text once to Glint’s existing Gemini guidance route. Gemini errors leave the draft in place for retry. Typed text still works through the same route.
- Glint releases the microphone before transcription. Electron permits audio capture for the active assistant request. Missing setup, microphone denial, device errors, empty recordings and transcription failures have visible recovery messages.

## Speech provider

Local `whisper.cpp` v1.8.3 runs on the CPU with the multilingual `ggml-small-q5_1.bin` model. The Windows x64 setup command verifies both downloads against pinned SHA-256 digests. The assistant pipes audio to the local process and receives UTF-8 text. Recording audio stays in memory. Sending a reviewed goal uses Glint’s existing Gemini request with the goal and screen image. [Windows runtime release](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.3) · [Whisper model repository](https://huggingface.co/ggerganov/whisper.cpp)

Wispr documents a separate dictation app that inserts into text fields and an MCP integration for meeting information. No public, officially supported transcription API for audio captured by Glint was found. Local Whisper supports both selected languages without a speech subscription or a cloud audio endpoint. [Wispr dictation setup](https://docs.wisprflow.ai/articles/3152211871) · [Wispr Flow MCP](https://github.com/Wispr-AI/wispr-flow-plugin) · [Whisper language table](https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/src/whisper.cpp)

## November 21, 2026 verification

| Check | Observed result |
| --- | --- |
| English, physical microphone | A Windows-generated speech clip played through the speakers into the physical microphone. The editable transcript exactly matched `Show me how to open Bluetooth settings.` The edited draft reached L1 with the Gemini fixture. |
| Tamil, physical microphone | The published Tamil test clip played through the speakers into the physical microphone. Whisper returned `அதனால் காதக்குள் குச்சிப்பாட்ச் விட்டுச் சுத்தம் செய்யக்கூடாது.` The sentence was recognizable and contained substitutions. A corrected Tamil Bluetooth goal reached L1 with the Gemini fixture. A live Tamil speaker and spoken Bluetooth vocabulary remain to be tested. |
| File-backed microphone | Both clips also passed in Chromium’s file-backed microphone mode through the real recorder and local model. An English transcript matched exactly. Tamil stayed editable as Unicode and contained a word error. |
| L1 recovery and text parity | The voice suite confirmed no submission on cancel or before review, ended microphone tracks on cancel and stop, rejected capture outside an active assistant request, sent one request per explicit submission, kept the draft after a simulated Gemini 403, and produced identical prompts for equivalent typed and voice input. |
| Live Gemini | A physical-microphone English transcript went through the usual Send control and rendered `Click on Bluetooth & devices to open your Bluetooth settings.` with a synthetic Settings screenshot. The preferred model returned 503 on the first run and timed out on the repeat. Glint’s existing fallback to `gemini-3.5-flash-lite` returned HTTP 200 both times. |
| Actual Windows navigation | Following the instruction in Windows Settings opened the **Bluetooth & devices** page from Home. This check used the existing Settings controls. The live Gemini test used a synthetic image because the actual Settings window showed account and device information. |
| L2 | On the controlled Windows target, the fixture exercised the widget, overlay, pause, resume and completion. It required the fixture’s known native control handle after desktop-root UI Automation missed it. The Bluetooth demo uses Minimal (L1). |
| Build and launch | `npm run typecheck`, `npm run build`, and `npm run test:desktop` passed. The desktop suite exercised launch, restart, settings, screen capture, and the two-minute reminder with isolated profiles. |

The Tamil stimulus was Gnani.ai’s published `ta-in-f.wav` example. The English stimulus was synthesized locally with Windows Speech. [Tamil test audio and reference transcript](https://github.com/gnani-ai/text-to-speech/blob/master/README.md)

Representative test output:

```text
PASS en physical microphone via speaker playback / Show me how to open Bluetooth settings.
PASS ta physical microphone via speaker playback / அதனால் காதக்குள் குச்சிப்பாட்ச் விட்டுச் சுத்தம் செய்யக்கூடாது.
PASS permission scope, cancellation, track cleanup, editable review, single submission, Gemini error and L1 text parity
UIA fixture lookup required known control handle
```

## Reproduce

In a Windows 11 x64 PowerShell terminal at the repository root, run:

```powershell
npm ci
npm run setup:voice
npm run typecheck
npm run build
npm run test:desktop
npm start
```

Use the tray menu to open Glint’s Settings, configure a valid Gemini key under **AI**, and select **General → Minimal (Conversational Text)**. Follow [the 75-second demo](GLINT_HACKATHON_DEMO.md) for the Bluetooth workflow.

To repeat the controlled voice tests, supply short mono PCM WAV clips. The English fixture should contain **Bluetooth**. The Tamil test asserts that recognition produces Tamil characters and that edits survive submission. Both modes use a local Gemini fixture. The `--physical` variant plays the supplied sample on the current Windows output and records it through the default Windows microphone.

```powershell
node tests/desktop/voice.cjs en C:\path\to\english.wav
node tests/desktop/voice.cjs ta C:\path\to\tamil.wav --physical
```

## Known limitations

- Speech accuracy depends on signal quality and language. Tamil playback proved physical-microphone transcription in Tamil script, with noticeable correction effort for the tested sentence. Rehearse the Tamil demo sentence with the presenter before showing it.
- The model must be downloaded once. Transcription runs locally, while guidance requires network access and a valid Gemini key. Each L1 submission provides the next instruction using the current screen.
- The demo verifies navigation to the Bluetooth settings page. Pairing headphones is a separate user action. L2 highlighting remains dependent on Windows UI Automation and the demo fallback uses the existing L1 text guidance.
