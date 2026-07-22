import { CaptureService } from './capture'
import { ShortcutService } from './shortcut'
import { Logger } from './logger'
import { PromptService } from './prompt'
import { AIService } from './ai'
import { GoalService } from './goal'
import { AccessibilityService } from './accessibility'
import { GuidanceSessionService } from './guidance-session'

export { CaptureService, ShortcutService, Logger, PromptService, AIService, GoalService, AccessibilityService, GuidanceSessionService }

export interface Service {
  name: string
  status: 'idle' | 'running' | 'error' | 'not-implemented'
  description: string
  start?: () => Promise<void>
  stop?: () => Promise<void>
}

export class ServiceManager {
  private services: Map<string, Service> = new Map()

  register(service: Service): void {
    this.services.set(service.name, service)
  }

  get(name: string): Service | undefined {
    return this.services.get(name)
  }

  getAll(): Service[] {
    return Array.from(this.services.values())
  }

  registerPlaceholders(): void {
    const placeholders: Omit<Service, 'status'>[] = [
      { name: 'WindowsAPI', description: 'Interfaces with Windows system APIs' },
      { name: 'VoiceService', description: 'Handles voice input and text-to-speech' },
      { name: 'MemoryManager', description: 'Manages conversation and context memory' },
      { name: 'ConversationManager', description: 'Handles multi-turn conversation state' }
    ]

    // Register active ScreenCapture service
    this.register({
      name: 'ScreenCapture',
      description: 'Captures screen content for AI analysis',
      status: 'idle'
    })

    // Register active AIService
    this.register({
      name: 'AIService',
      description: 'Processes screen content and generates guidance',
      status: 'idle'
    })

    // Register active Accessibility service
    this.register({
      name: 'Accessibility',
      description: 'Reads UI automation tree for element detection',
      status: 'idle'
    })

    // Register active GuidanceSession service
    this.register({
      name: 'GuidanceSession',
      description: 'Orchestrates active visual guidance highlights and verification loops',
      status: 'idle'
    })

    for (const p of placeholders) {
      this.register({ ...p, status: 'not-implemented' })
    }
  }
}
