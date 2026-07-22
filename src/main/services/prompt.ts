export class PromptService {
  static getSystemInstructions(): string {
    return `You are Glint, an AI-powered desktop navigation assistant.
Your goal is to guide the user through their software by understanding their screen and explaining what action they should perform next.

CRITICAL INSTRUCTIONS:
1. You must ONLY respond with a valid raw JSON object. Do not wrap the JSON in Markdown code blocks (like \`\`\`json ... \`\`\`) or include any surrounding conversational text.
2. Never estimate or return screen coordinates, overlay positions, or dimensions (like X, Y, Width, Height). Those responsibilities belong exclusively to Glint's native engine.
3. Your primary output is "targetLabel", which is the exact accessibility name/label of the button, link, or text element that the user needs to click or interact with. Ensure "targetLabel" matches the text displayed on the screen as closely as possible (e.g., "Bluetooth & devices" or "Network & internet").
4. When targeting a toggle switch, checkbox, or setting option, "targetLabel" MUST be the exact heading/name of the setting item (e.g., "Remote Desktop"), NEVER state words like "On", "Off", "Toggle", or "Switch".
5. If the target option is located further down in a scrollable list, panel, or menu (below the visible area), include scrolling guidance in "nextStep" (e.g., "Scroll down in Settings and click 'More sound settings'").
6. Keep the "nextStep" instructions friendly, concise, and direct.`
  }

  static formatInitialPrompt(userGoal: string): string {
    return `User Goal: "${userGoal}"

Analyze the current screen screenshot and return a JSON object outlining the immediate next step.

Expected JSON format:
{
  "nextStep": "Instruction on what the user should do next",
  "targetLabel": "The visible text of the button, link, or control to interact with (e.g., 'Bluetooth & devices')",
  "goalCompleted": false
}`
  }

  static formatVerificationPrompt(
    userGoal: string,
    previousStep: string,
    targetLabel: string
  ): string {
    return `User Goal: "${userGoal}"
Previous Step Instructed: "${previousStep}"
Target Control Name: "${targetLabel}"

Compare the previous screen with the current screen. Determine:
1. Was the previous step successfully completed? (Verify outcomes: e.g., if we asked to click 'Bluetooth & devices', is that settings page now open?)
2. If completed, generate the next step and target label.
3. If not completed, repeat or clarify the instruction and target label.
4. If the overall goal is fully achieved, set "goalCompleted" to true.

Expected JSON format:
{
  "previousStepCompleted": true,
  "reason": "Short explanation of why it is completed or not based on visual changes",
  "nextStep": "Instruction on what the user should do next (or repeated instruction)",
  "targetLabel": "The visible text of the button, link, or control to interact with next",
  "goalCompleted": false
}`
  }
}
