import { setTimeout as delay } from 'node:timers/promises'
import type { Rectangle } from './accessibility-provider'
import { auditAutomation } from './automation-audit'
import { OverlayService } from './overlay'
import { WindowsActionError, windowsScript } from './windows-shell'

export const uiaTypes = [
  'Button', 'Hyperlink', 'TabItem', 'TreeItem', 'ListItem', 'MenuItem', 'CheckBox', 'RadioButton',
  'ComboBox', 'Text', 'Group', 'Pane', 'List', 'Tab', 'Tree', 'Menu', 'Window', 'Edit', 'Custom'
] as const
type ControlType = typeof uiaTypes[number]
export type WindowBinding = { handle: string; process: number; name?: string; className?: string; executable?: string }
export type WindowScope = { kind: 'settings' | 'foreground' } | ({ kind: 'observed' } & WindowBinding)
export type Selector = {
  names?: readonly string[]
  automationId?: string
  types?: readonly ControlType[]
  ancestor?: string
  children?: boolean
}
type Parent = { name: string; automationId: string; type: string }
export type Element = Parent & {
  runtimeId: string
  process: number
  className: string
  heading: string
  visible: boolean
  enabled: boolean
  bounds?: Rectangle
  parents: Parent[]
  patterns: string[]
  state: { toggle?: string; selected?: boolean; expanded?: string; value?: string; valueReadOnly?: boolean; selection?: string[] }
}
type Observation = { status: 'observed'; window: WindowBinding; items: Element[] }
type Reply = Observation | { status: 'dispatched'; window: WindowBinding } | {
  status: 'window-unavailable' | 'not-actionable' | 'not-visible' | 'unsupported-pattern' |
  'unsupported-operation' | 'provider-error' | 'stale' | 'state-changed'
}
export type ElementRef = { scope: WindowScope; window: WindowBinding; selector: Selector; element: Element }
type Navigation = 'invoke' | 'select' | 'expand' | 'collapse'
type Worker = typeof windowsScript

export class UiaError extends WindowsActionError {
  constructor(readonly reason: string, message: string) { super(message) }
}

export function isPageHeading(element: Element) {
  return element.visible && (['Level1', '80051'].includes(element.heading) ||
    (element.type === 'Text' && /(?:page|breadcrumb|header).*title|pageheader/i.test(element.automationId)))
}

function hierarchy(element: Element) {
  return element.parents.map(parent => [parent.type, parent.name, parent.automationId].join('|')).join('\x1f')
}

export function sameTarget(a: Element, b: Element) {
  return a.process === b.process && a.name === b.name && a.automationId === b.automationId &&
    a.type === b.type && hierarchy(a) === hierarchy(b)
}

function sameWindow(a: WindowBinding, b: WindowBinding) {
  return a.handle === b.handle && a.process === b.process
}

export class WindowsUia {
  constructor(private readonly run: string, readonly signal: AbortSignal, private readonly worker: Worker = windowsScript) {}

  private trace(operation: string, status: 'observed' | 'attempted' | 'failed' | 'verified', target: string, result: string) {
    auditAutomation(this.run, operation, status, { target, result })
  }

  private async request(scope: WindowScope, operation: string, query: Selector, ref?: ElementRef,
    options: { action?: Navigation; expectedState?: string; readValue?: boolean } = {}): Promise<Reply> {
    this.signal.throwIfAborted()
    try {
      const raw = await this.worker('windows-uia.ps1', {
        GLINT_UIA_REQUEST: JSON.stringify({
          window: scope, operation, query, ...options,
          binding: ref?.window,
          element: ref && { ...ref.element, hierarchy: hierarchy(ref.element) }
        })
      }, { signal: this.signal, timeout: 6500, maxBuffer: 512 * 1024 })
      const result = JSON.parse(raw) as Reply
      if (result.status === 'observed' && (!result.window?.handle || !Number.isSafeInteger(result.window.process) ||
          !Array.isArray(result.items))) return { status: 'provider-error' }
      return result
    } catch {
      this.signal.throwIfAborted()
      return { status: 'provider-error' }
    }
  }

  async inspect(scope: WindowScope, selector: Selector = {}, target = 'accessibility tree', readValue = false) {
    const result = await this.request(scope, Object.keys(selector).length ? 'find' : 'inspect', selector, undefined, { readValue })
    this.trace('uia.inspect', result.status === 'observed' ? 'observed' : 'failed', target,
      result.status === 'observed' ? `matches:${result.items.length}` : result.status)
    if (result.status !== 'observed') throw new UiaError(result.status, 'Glint could not inspect the requested foreground window.')
    return result
  }

  async waitFor(scope: WindowScope, selector: Selector, target: string, predicate: (item: Element) => boolean,
    attempts = 3, binding?: WindowBinding): Promise<ElementRef> {
    let reason = 'missing'
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt) {
        this.trace('uia.wait', 'attempted', target, `retry:${reason}`)
        await delay(180, undefined, { signal: this.signal })
      }
      try {
        const { window, items } = await this.inspect(scope, selector, target, true)
        if (binding && !sameWindow(binding, window)) throw new UiaError('window-changed', 'The target window changed.')
        const matches = items.filter(predicate)
        if (matches.length === 1) {
          this.trace('uia.wait', 'verified', target, 'unique match')
          return { scope, window, selector, element: matches[0] }
        }
        reason = matches.length ? 'ambiguous' : 'missing'
      } catch (error) {
        if (!(error instanceof UiaError)) throw error
        reason = error.reason
      }
    }
    this.trace('uia.wait', 'failed', target, reason)
    throw new UiaError(reason, `Glint could not verify ${target} in the foreground window (${reason}).`)
  }

  private refresh(ref: ElementRef, target: string) {
    return this.waitFor(ref.scope, ref.selector, target, item => sameTarget(ref.element, item), 2, ref.window)
  }

  async reveal(ref: ElementRef, target: string): Promise<ElementRef> {
    let current = ref
    for (let attempt = 0; attempt <= 4; attempt++) {
      const check = await this.request(current.scope, 'bounds', current.selector, current)
      if (check.status === 'observed' && check.items.length === 1) {
        this.trace('uia.bounds', 'verified', target, 'on-screen and unobstructed')
        return { ...current, element: check.items[0] }
      }
      if (attempt === 4) break
      if (check.status === 'stale') {
        this.trace('uia.bounds', 'attempted', target, 'retry:stale')
        current = await this.refresh(current, target)
        continue
      }
      if (check.status !== 'not-visible') {
        this.trace('uia.bounds', 'failed', target, check.status)
        throw new UiaError(check.status, `Glint could not verify the on-screen position of ${target}.`)
      }
      const scroll = await this.request(current.scope, 'scroll', current.selector, current)
      this.trace('uia.scroll', scroll.status === 'dispatched' ? 'attempted' : 'failed', target, scroll.status)
      if (!['dispatched', 'stale'].includes(scroll.status)) break
      await delay(180, undefined, { signal: this.signal })
      current = await this.refresh(current, target)
    }
    this.trace('uia.bounds', 'failed', target, 'not-visible')
    throw new UiaError('not-visible', `Glint could not bring ${target} into view.`)
  }

  async navigate(ref: ElementRef, action: Navigation, target: string,
    destination: (before: ElementRef) => Promise<ElementRef>) {
    let current = await this.reveal(ref, target)
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.request(current.scope, 'navigate', current.selector, current, { action })
      this.trace('uia.navigate', 'attempted', target, `${action}:${result.status}`)
      if (result.status === 'stale') {
        current = await this.reveal(await this.refresh(current, target), target)
        continue
      }
      // A provider can throw after dispatching. Observe the destination before
      // deciding the action failed, and never replay an uncertain invocation.
      if (result.status === 'dispatched' || result.status === 'provider-error') {
        const reached = await destination(current)
        this.trace('uia.navigate', 'verified', target, 'destination observed')
        return reached
      }
      throw new UiaError(result.status, `Windows did not expose an available navigation action for ${target}.`)
    }
    throw new UiaError('stale', `The control for ${target} changed while Glint navigated.`)
  }

  async toggle(ref: ElementRef, target: string, before: 'On' | 'Off', after: 'On' | 'Off') {
    const current = await this.reveal(ref, target)
    if (current.element.state.toggle !== before) throw new UiaError('state-changed', `${target} changed before confirmation could be applied.`)
    const result = await this.request(current.scope, 'toggle', current.selector, current, { expectedState: before })
    this.trace('uia.toggle', 'attempted', target, result.status)
    if (!['dispatched', 'provider-error'].includes(result.status)) {
      throw new UiaError(result.status, `Windows did not apply the confirmed change to ${target}.`)
    }
    return this.waitFor(ref.scope, ref.selector, target,
      item => sameTarget(ref.element, item) && item.state.toggle === after, 3, ref.window)
  }

  async highlight(ref: ElementRef, label: string, target = label) {
    const current = await this.reveal(ref, target)
    this.signal.throwIfAborted()
    if (!current.element.bounds || !OverlayService.highlight(current.element.bounds, label, 'look')) {
      this.trace('uia.highlight', 'failed', target, 'overlay-unavailable')
      throw new UiaError('overlay-unavailable', `Glint found ${target} but could not draw its highlight.`)
    }
    this.trace('uia.highlight', 'verified', target, 'overlay placed on UIA bounds')
    return current
  }
}
