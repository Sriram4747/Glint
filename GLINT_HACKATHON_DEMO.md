# Glint hackathon demo

**Everyday Access | Your Computer. Your Language.** Ask Glint for a Windows Settings page or a File Explorer folder in English or Tamil. Review what it heard and send the request. Glint opens the destination directly.

## Before the demo

On Windows 11 x64, open [Glint.exe](Glint.exe) from the project root. You can copy this file by itself to another test PC. The portable build includes the local multilingual Whisper model and opens the assistant on launch. The native demo actions work without a Gemini key.

The hosted demo build also uses the Glint relay for online AI on any supported test PC with internet access. Testers can launch the EXE directly. [Maintainer relay deployment and usage limits](relay/README.md)

To rebuild the portable file on a development PC with the Visual Studio C++ x64 redistributable components installed, run:

```powershell
npm ci
npm run setup:voice
npm run build:portable
```

To reopen the assistant, use **Open Assistant** from the tray. **Ctrl+Shift+Space** also works when Glint has registered the shortcut. Start with Windows Settings closed. Check the presenter’s default microphone and rehearse both voice lines.

## Windows Settings

| Step | Enter or say | Expected Windows heading |
| --- | --- | --- |
| 1 | Type `Open Wi-Fi settings.` | Network & internet › Wi-Fi |
| 2 | Say in English, `Open Bluetooth settings.` | Bluetooth & devices › Devices |
| 3 | Type `Take me to display settings.` | System › Display |
| 4 | Say in Tamil, `ஒலி அமைப்புகளைத் திறக்கவும்.` The mixed-language `Sound settings திற.` also works as text. | System › Sound |
| 5 | Type `Open Windows Update.` | Windows Update |

For voice, select **English** or **தமிழ் (Tamil)**, click the microphone, speak, then click **Stop recording**. Wait for the transcript, correct any words in the goal field, and press **Send**. Enter is the keyboard equivalent. For typed requests, enter the command in the same goal field and send it. After each action, show the heading in the actual Settings window, then reopen the assistant for the next request.

An optional clarification example is `Open Wi-Fi or Bluetooth settings.` Glint asks which page to open. Submit `Open Wi-Fi settings.` to continue. To show cancellation, start a voice recording and press **Esc** or **Cancel** before sending.

### Nested display settings

1. Open the Glint assistant and type **How to enable dynamic refresh rate for my display?** Press **Send**.
2. Watch Glint open Windows Settings, verify **System › Display**, and activate **Advanced display**. Leave the intermediate controls alone.
3. Show the outline on **Dynamic refresh rate**. Reopen Glint from the tray to read its observed state. If Windows disables the switch or exposes no Dynamic option for the selected display, show Glint’s availability message. Leave the switch and refresh-rate list unchanged.

`Find Windows Update history.` is a second example. Glint opens **Windows Update**, activates **Update history**, and highlights the verified destination. The two nested requests work without a Gemini key.

## File Explorer

| Step | Enter or say | Verify in Explorer |
| --- | --- | --- |
| 1 | Say in English, `Open my Downloads folder.` | Downloads |
| 2 | Type `Show me my Documents.` | Documents |
| 3 | Say in Tamil, `படங்கள் கோப்புறையைத் திறக்கவும்.` | Pictures |

After sending each request, show the folder name in Explorer’s address bar. To demonstrate opening the app itself, type `Open File Explorer.` Glint opens **This PC**. `Open Downloads or Documents` prompts the presenter to choose a folder. `Show me the latest PDF in Downloads` offers to open the folder for browsing. This demo is limited to folder navigation.

## Presenter notes

- Use the Settings heading to verify those pages. Glint checks the resolved location in Explorer itself and reports when the folder is open. Windows builds, hardware and organizational policy can affect availability.
- Pause for the editable draft and make the explicit Send visible. Tamil recognition varies by speaker and microphone. If the transcript is inaccurate, correct it before sending. If recording is unavailable, type `ஒலி அமைப்புகளைத் திறக்கவும்.` in the goal field.
- Leave the Settings controls alone during the demo. Pairing, connecting, changing settings and checking for updates are separate actions.
- Glint uses L1 or L2 guidance with a configured Gemini key when it cannot complete automation. It continues supported nested navigation through to the requested control.

See [the verified destinations](GLINT_NATIVE_NAVIGATION.md) and [the nested automation test report](GLINT_NESTED_AUTOMATION_TEST_REPORT.md).
