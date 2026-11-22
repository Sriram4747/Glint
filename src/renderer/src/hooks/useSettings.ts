import { useState, useEffect } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../types'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    window.glintAPI.getSettings().then(saved => {
      if (!mounted) return
      setSettings({
        general: { ...DEFAULT_SETTINGS.general, ...saved.general },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...saved.appearance },
        ai: { ...DEFAULT_SETTINGS.ai, ...saved.ai }
      })
      setReady(true)
    }).catch(() => setError('Could not load settings. Check settings.json and restart Glint.'))
    return () => { mounted = false }
  }, [])

  async function updateSetting<K extends keyof Settings>(section: K, key: keyof Settings[K] | 'apiKey', value: string | boolean) {
    try {
      await window.glintAPI.saveSettings({ [section]: { [key]: value } })
      setSettings(previous => ({
        ...previous, [section]: {
          ...previous[section], ...(key === 'apiKey' ? { hasApiKey: Boolean(String(value).trim()) } : { [key]: value })
        }
      }))
      setError('')
      return true
    } catch {
      setError('Could not save this change. Check Windows credential storage and profile write access.')
      return false
    }
  }
  return { settings, ready, error, updateSetting }
}
