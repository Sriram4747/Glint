# Glint Round 1 demo

**Everyday Access | Your Computer. Your Language.** People who are more comfortable speaking Tamil can get stuck in Windows settings that use unfamiliar English terms. Glint lets them say what they want to do, correct the transcription, and get a screen-specific next step while keeping the visible Windows labels recognizable.

## Before recording the demo

1. On Windows 11 x64, open PowerShell in the Glint repository and run `npm ci`, `npm run setup:voice`, `npm run build`, then `npm start`. The one-time voice setup downloads the CPU runtime and a roughly 190 MB multilingual model.
2. From the Glint tray menu, open **Settings → AI** and save a valid Gemini API key. Select **Gemini 3.5 Flash Lite**, which returned the live rehearsal instruction. In **General → Guidance Level**, select **Minimal (Conversational Text)**. Glint sends the submitted text and a screen image to Gemini after you press **Send**. Microphone audio stays on the PC.
3. Use a demo Windows profile with generic account and device names. Open Windows **Settings** with **Win+I**, maximize it on the primary display, and leave it on **Home** with the sidebar visible. In Windows microphone privacy settings, enable microphone access for desktop apps. Run one practice request to confirm the selected input and Gemini account are ready.

## 75-second script

| Time | On screen and narration |
| --- | --- |
| 0–10 s | Show Windows Settings Home. “If I know what I want to do but don’t recognize the Windows menu, I can ask Glint in the language I speak.” |
| 10–20 s | Press **Ctrl+Shift+Space**. Show the **Voice** selector, choose **English**, and click the microphone. “I choose my language and speak one short request.” |
| 20–35 s | Say **“Show me how to open Bluetooth settings.”** While **Listening** is visible, click the microphone again to stop. Wait for the transcript to appear. |
| 35–48 s | Read the transcript, correct a word if needed, and click **Send**. “I can check every word before Glint uses it.” |
| 48–65 s | Show the L1 instruction. The expected instruction points to **Bluetooth & devices** in the Settings sidebar. Click that item in Windows yourself and show the destination page. |
| 65–75 s | Reopen Glint and show **தமிழ் (Tamil)** in the selector. After a successful Tamil rehearsal, repeat the request in Tamil as a second take. |

For Tamil, say **“புளூடூத் அமைப்புகளை எப்படித் திறப்பது?”**

Expected behavior in either language is a visible listening state, a local transcription step, an editable goal, and one guidance request after **Send**. The goal language supplies the model’s response language. Windows control labels are shown as they appear on screen. The Bluetooth workflow ends when the **Bluetooth & devices** page opens. [Microsoft’s Windows Bluetooth settings guide](https://support.microsoft.com/en-au/windows/bluetooth/find-bluetooth-settings-in-windows)

## L1 fallback and recovery

- If rehearsing in **Standard (Visual Guidance)** and the highlight is missing or points to the wrong control, select **Stop Guidance** from the Glint tray menu. Open Glint **Settings → General**, select **Minimal (Conversational Text)**, return Windows Settings to Home, and send the goal again. Announce “Glint is giving me text instructions” and follow the displayed instruction manually.
- During capture or transcription, click **Cancel** or press **Esc** to discard the attempt. If the microphone is unavailable, type the same request into the goal box. Use this to demonstrate the guidance flow and describe the microphone issue separately.
- If Gemini returns an error, the draft remains editable. Check the **AI** settings and retry **Send**. A successful live model response is needed for the complete demo.
