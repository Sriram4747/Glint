# Glint hackathon demo

**Everyday Access | Your Computer. Your Language.** Ask Glint for a Windows Settings page in English or Tamil. Review what it heard and send the request. Windows Settings opens the requested page directly.

## Before the demo

On Windows 11 x64, run the following from the Glint folder. Voice setup installs the local multilingual Whisper model and runtime once. A Gemini key is optional for these five actions.

```powershell
npm ci
npm run setup:voice
npm run build
npm start
```

From the tray icon, select **Open Assistant**. **Ctrl+Shift+Space** also works when Glint has registered the shortcut. Start with Windows Settings closed. Check the presenter’s default microphone and rehearse both voice lines.

## Five direct actions

| Step | Enter or say | Expected Windows heading |
| --- | --- | --- |
| 1 | Type `Open Wi-Fi settings.` | Network & internet › Wi-Fi |
| 2 | Say in English, `Open Bluetooth settings.` | Bluetooth & devices › Devices |
| 3 | Type `Take me to display settings.` | System › Display |
| 4 | Say in Tamil, `ஒலி அமைப்புகளைத் திறக்கவும்.` The mixed-language `Sound settings திற.` also works as text. | System › Sound |
| 5 | Type `Open Windows Update.` | Windows Update |

For voice, select **English** or **தமிழ் (Tamil)**, click the microphone, speak, then click **Stop recording**. Wait for the transcript, correct any words in the goal field, and press **Send**. Enter is the keyboard equivalent. For typed requests, enter the command in the same goal field and send it. After each action, show the heading in the actual Settings window, then reopen the assistant for the next request.

An optional clarification example is `Open Wi-Fi or Bluetooth settings.` Glint asks which page to open. Submit `Open Wi-Fi settings.` to continue. To show cancellation, start a voice recording and press **Esc** or **Cancel** before sending.

## Presenter notes

- Glint reports that it asked Windows to open the page. Use the Windows heading to verify the result. Windows builds, adapters and organizational policy can affect page availability.
- Pause for the editable draft and make the explicit Send visible. Tamil recognition varies by speaker and microphone. If the transcript is inaccurate, correct it before sending. If recording is unavailable, type `ஒலி அமைப்புகளைத் திறக்கவும்.` in the goal field.
- Leave the Settings controls alone during the demo. Pairing, connecting, changing settings and checking for updates are separate actions.
- Questions about how to use a page can use existing L1 or L2 guidance with a configured Gemini key. Supported page-opening requests work without it.

See [the verified destinations](GLINT_NATIVE_NAVIGATION.md) and [the test report](GLINT_NAVIGATION_TEST_REPORT.md).
