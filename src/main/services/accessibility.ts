import { 
  IAccessibilityProvider, 
  PowerShellAccessibilityProvider, 
  AccessibilitySearchResult 
} from './accessibility-provider'

export class AccessibilityService {
  private static provider: IAccessibilityProvider = new PowerShellAccessibilityProvider()

  /**
   * Overrides the current active provider (e.g. for unit testing or future locator integrations).
   */
  static setProvider(customProvider: IAccessibilityProvider): void {
    this.provider = customProvider
  }

  /**
   * Search for a control dynamically by its accessibility label.
   */
  static async search(
    targetLabel: string,
    windowTitleHint?: string
  ): Promise<AccessibilitySearchResult> {
    return this.provider.search(targetLabel, windowTitleHint)
  }
}
export type { AccessibilitySearchResult, Rectangle } from './accessibility-provider'
