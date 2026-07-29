export class PromptService {
  static getSystemInstructions(): string {
    return `You are Glint, an AI-powered desktop navigation assistant.
Your goal is to guide the user through their software by understanding their screen and explaining what action they should perform next.

CRITICAL INSTRUCTIONS:
1. You must ONLY respond with a valid raw JSON object. Do not wrap the JSON in Markdown code blocks (like \`\`\`json ... \`\`\`) or include any surrounding conversational text.
2. Never estimate or return screen coordinates, overlay positions, or dimensions (like X, Y, Width, Height). Those responsibilities belong exclusively to Glint's native engine.
3. Your primary output is "targetLabel", which is the exact accessibility name/label of the button, link, or text element that the user needs to click or interact with. Ensure "targetLabel" matches the text displayed on the screen as closely as possible (e.g., "Bluetooth & devices" or "Properties").
4. Specify "actionType" for EVERY step: MUST be one of ["click", "right_click", "double_click", "type", "scroll"].
   - Use "right_click" when opening context menus (e.g. right-clicking a file to view properties).
   - Use "double_click" when opening folders or launching files.
   - Use "type" when the user needs to enter text into an input box or search field.
   - Use "scroll" when the target item is further down the page.
   - Use "click" for standard left-clicks.
5. When targeting a toggle switch, checkbox, or setting option, "targetLabel" MUST be the exact heading/name of the setting item (e.g., "Remote Desktop"), NEVER state words like "On", "Off", "Toggle", or "Switch".
6. Keep the "nextStep" instructions friendly, concise, and direct.`
  }

  static formatInitialPrompt(userGoal: string): string {
    return `User Goal: "${userGoal}"

Analyze the current screen screenshot and return a JSON object outlining the immediate next step.

Expected JSON format:
{
  "nextStep": "Instruction on what the user should do next",
  "targetLabel": "The visible text of the control (e.g., 'Properties')",
  "actionType": "right_click",
  "goalCompleted": false
}`
  }

  static formatGoalPlanPrompt(userGoal: string): string {
    return `User Goal: "${userGoal}"

Analyze the current screen screenshot and generate a complete multi-step guidance plan to achieve the user's goal.
Break down the task into logical, sequential UI action steps (typically 2 to 5 steps).

Expected JSON format:
{
  "goal": "${userGoal}",
  "steps": [
    {
      "stepIndex": 1,
      "instruction": "Right-click on the file or folder",
      "targetLabel": "sample.txt",
      "actionType": "right_click"
    },
    {
      "stepIndex": 2,
      "instruction": "Click on 'Properties' from the menu",
      "targetLabel": "Properties",
      "actionType": "click"
    }
  ]
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
1. Was the previous step successfully completed? (IMPORTANT: If the user clicked/right-clicked and a context menu, dropdown, or new view is now open on the current screen, mark "previousStepCompleted" as true!).
2. If completed, generate the next step, exact visible targetLabel, and actionType for what to click next on the CURRENT screen.
3. If the user's current screen already displays the next logical menu option (e.g., 'Properties', 'Grant access to', or 'Share'), set targetLabel to that exact visible text.
4. If the overall goal is fully achieved, set "goalCompleted" to true.

Expected JSON format:
{
  "previousStepCompleted": true,
  "reason": "Short explanation of outcome",
  "nextStep": "Instruction on what the user should do next",
  "targetLabel": "Exact visible text of target control on current screen",
  "actionType": "click",
  "goalCompleted": false
}`
  }
}
