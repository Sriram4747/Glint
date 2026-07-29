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

    const overlayBounds = win.getBounds()
    const targetDisplay = screen.getAllDisplays().find((display) => {
      const scaleFactor = display.scaleFactor || 1
      const physicalBounds = {
        x: display.bounds.x * scaleFactor,
        y: display.bounds.y * scaleFactor,
        width: display.bounds.width * scaleFactor,
        height: display.bounds.height * scaleFactor
      }

      return (
        rect.x >= physicalBounds.x &&
        rect.y >= physicalBounds.y &&
        rect.x < physicalBounds.x + physicalBounds.width &&
        rect.y < physicalBounds.y + physicalBounds.height
      )
    }) || screen.getDisplayNearestPoint({ x: rect.x, y: rect.y })
    const scaleFactor = targetDisplay.scaleFactor || 1
    const displayBounds = targetDisplay.bounds

    // UIA rectangles are physical pixels; Electron window bounds are DIP.
    const desktopRect: Rectangle = {
      x: displayBounds.x + ((rect.x - displayBounds.x * scaleFactor) / scaleFactor),
      y: displayBounds.y + ((rect.y - displayBounds.y * scaleFactor) / scaleFactor),
      width: rect.width / scaleFactor,
      height: rect.height / scaleFactor
    }

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
      Logger.warn(`OverlayService: Refusing to highlight invalid/off-screen rectangle for "${label}": ${JSON.stringify(rect)}`)
      this.clear()
      return false
    }

    Logger.info(`OverlayService: Highlighting label "${label}" [${actionType}] at UIA=${JSON.stringify(rect)} OverlayLocal=${JSON.stringify(localRect)}`)
    this.currentHighlight = { rect: localRect, label, actionType }

    showOverlayWindow()

    // Send the highlight data to the renderer — but wait for the page to finish loading first
    // so that the React component's IPC listener is registered before the message arrives
    const sendUpdate = (): void => {
      const w = getOverlayWindow()
      if (w && !w.isDestroyed()) {
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
