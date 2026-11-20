import type { BrowserWindow, WebContents } from 'electron'

export type WindowRole = 'assistant' | 'settings' | 'system-details' | 'floating-assistant' | 'overlay'
const roles = new WeakMap<WebContents, WindowRole>()

export function registerWindow(win: BrowserWindow, role: WindowRole): void {
  roles.set(win.webContents, role)
}

export function roleOf(contents: WebContents): WindowRole | undefined {
  return roles.get(contents)
}
