import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'path'
import { createAssistantWindow } from './windows/assistant'
import { createSettingsWindow } from './windows/settings'
import { createSystemDetailsWindow } from './windows/system-details'

let tray: Tray | null = null

export function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('Glint — AI Navigation Assistant')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'System Details',
      click: (): void => {
        createSystemDetailsWindow()
      }
    },
    {
      label: 'Settings',
      click: (): void => {
        createSettingsWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    createAssistantWindow()
  })
}
