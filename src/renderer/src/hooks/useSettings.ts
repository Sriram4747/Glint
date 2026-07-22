import { useState, useCallback, useEffect } from 'react'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

interface UseSettingsReturn {
  settings: Settings
  updateSetting: <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: Settings[K][keyof Settings[K]]
  ) => void
  resetSettings: () => void
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  // Load settings from backend via IPC on mount
  useEffect(() => {
    async function loadSettings() {
      if (window.glintAPI?.getSettings) {
        const saved = await window.glintAPI.getSettings()
        if (saved) {
          setSettings((prev) => ({
            ...prev,
            ...saved,
            // Deep merge sections to preserve default properties safely
            general: { ...prev.general, ...(saved.general || {}) },
            appearance: { ...prev.appearance, ...(saved.appearance || {}) },
            voice: { ...prev.voice, ...(saved.voice || {}) },
            hotkeys: { ...prev.hotkeys, ...(saved.hotkeys || {}) },
            ai: { ...prev.ai, ...(saved.ai || {}) }
          }))
        }
      }
    }
    loadSettings()
  }, [])

  const updateSetting = useCallback(
    <K extends keyof Settings>(
      section: K,
      key: keyof Settings[K],
      value: Settings[K][keyof Settings[K]]
    ) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          [section]: {
            ...prev[section],
            [key]: value
          }
        }
        // Save back via IPC automatically
        window.glintAPI?.saveSettings(next)
        return next
      })
    },
    []
  )

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    window.glintAPI?.saveSettings(DEFAULT_SETTINGS)
  }, [])

  return { settings, updateSetting, resetSettings }
}
