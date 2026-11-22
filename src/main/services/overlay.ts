import { screen } from 'electron'
import { getOverlayWindow, createOverlayWindow, showOverlayWindow, hideOverlayWindow } from '../windows/overlay'
import { Rectangle } from './accessibility'
import { Logger } from './logger'

export class OverlayService {
  private static wasVisibleBeforeScreenshot = false
  private static currentHighlight: { rect: Rectangle; label: string; actionType?: string } | null = null

  private static normalizeToOverlayBounds(rect: Rectangle): Rectangle | null {
    const win = getOverlayWindow()
    if (!win || win.isDestroyed()) {
      return null
    }

    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
      return null
    }
    const center = screen.screenToDipPoint({
      x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)
    })
    const display = screen.getDisplayNearestPoint(center)
    const bounds = display.bounds
    const previous = win.getBounds()
    if (previous.x !== bounds.x || previous.y !== bounds.y ||
        previous.width !== bounds.width || previous.height !== bounds.height) {
      win.setBounds(bounds)
    }
    const overlayBounds = win.getBounds()
    const desktopRect = screen.screenToDipRect(win, rect)

    const localRect: Rectangle = {
      x: Math.round(desktopRect.x - overlayBounds.x),
      y: Math.round(desktopRect.y - overlayBounds.y),
      width: Math.round(desktopRect.width),
      height: Math.round(desktopRect.height)
    }

    if (
      !Number.isFinite(localRect.x) ||
      !Number.isFinite(localRect.y) ||
      !Number.isFinite(localRect.width) ||
      !Number.isFinite(localRect.height) ||
      localRect.width <= 0 ||
      localRect.height <= 0
    ) {
      return null
    }

    const intersectsOverlay =
      localRect.x < overlayBounds.width &&
      localRect.y < overlayBounds.height &&
      localRect.x + localRect.width > 0 &&
      localRect.y + localRect.height > 0

    return intersectsOverlay ? localRect : null
  }

  /**
   * Highlights a target UI control bounding rectangle on screen with an action badge.
   */
  static highlight(rect: Rectangle, label: string, actionType: string = 'click'): boolean {
    let win = getOverlayWindow()
    if (!win) {
      win = createOverlayWindow()
    }

    const localRect = this.normalizeToOverlayBounds(rect)
    if (!localRect) {
      Logger.warn('OverlayService: Refusing to highlight invalid/off-screen rectangle')
      this.clear()
      return false
    }

    Logger.info('OverlayService: Highlighting label')
    this.currentHighlight = { rect: localRect, label, actionType }

    showOverlayWindow()

    // Send the highlight data to the renderer — but wait for the page to finish loading first
    // so that the React component's IPC listener is registered before the message arrives
    const sendUpdate = (): void => {
      const w = getOverlayWindow()
      if (w === win && w && !w.isDestroyed() && this.currentHighlight?.rect === localRect) {
        w.webContents.send('overlay:update', { rect: localRect, label, actionType })
      }
    }

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', sendUpdate)
    } else {
      sendUpdate()
    }

    return true
  }

  /**
   * Clears the current visual highlight overlay.
   */
  static clear(): void {
    Logger.info('OverlayService: Clearing highlight')
    this.currentHighlight = null
    this.wasVisibleBeforeScreenshot = false
    const win = getOverlayWindow()
    if (win) {
      win.webContents.send('overlay:clear')
      hideOverlayWindow()
    }
  }

  /**
   * Checks if an active highlight is currently set.
   */
  static hasActiveHighlight(): boolean {
    return this.currentHighlight !== null
  }

  /**
   * Temporary hide action to prevent overlay from appearing in screenshots.
   */
  static hideBeforeScreenshot(): void {
    const win = getOverlayWindow()
    if (win && win.isVisible()) {
      Logger.info('OverlayService: Hiding overlay before screenshot')
      this.wasVisibleBeforeScreenshot = true
      hideOverlayWindow()
    }
  }

  /**
   * Restore overlay visibility back to active after screenshot capture completes.
   */
  static restoreAfterScreenshot(): void {
    const win = getOverlayWindow()
    if (win && this.wasVisibleBeforeScreenshot) {
      Logger.info('OverlayService: Restoring overlay after screenshot')
      this.wasVisibleBeforeScreenshot = false
      showOverlayWindow()
    }
  }
}
