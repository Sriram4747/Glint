import { useMemo, useEffect } from 'react'
import type { WindowType } from './types'
import { AssistantView } from './views/assistant/AssistantView'
import { SettingsView } from './views/settings/SettingsView'
import { SystemDetailsView } from './views/system-details/SystemDetailsView'
import { OverlayView } from './views/overlay/OverlayView'
import { FloatingAssistantView } from './views/floating-assistant/FloatingAssistantView'

function App(): JSX.Element {
  const windowType = useMemo<WindowType>(() => {
    const params = new URLSearchParams(window.location.search)
    return (params.get('window') as WindowType) || 'assistant'
  }, [])

  // Clear body backgrounds for transparent window types (overlay / floating-assistant)
  useEffect(() => {
    if (windowType === 'overlay' || windowType === 'floating-assistant') {
      document.body.style.background = 'transparent'
      document.body.style.backgroundColor = 'transparent'
      const root = document.getElementById('root')
      if (root) {
        root.style.background = 'transparent'
        root.style.backgroundColor = 'transparent'
      }
    }
  }, [windowType])

  const renderView = (): JSX.Element => {
    switch (windowType) {
      case 'settings':
        return <SettingsView />
      case 'system-details':
        return <SystemDetailsView />
      case 'overlay':
        return <OverlayView />
      case 'floating-assistant':
        return <FloatingAssistantView />
      case 'assistant':
      default:
        return <AssistantView />
    }
  }

  return <>{renderView()}</>
}

export default App
