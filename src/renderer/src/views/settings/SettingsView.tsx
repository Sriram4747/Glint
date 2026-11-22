import React, { useState, useEffect } from 'react';
import './SettingsView.css';
import { Toggle } from '@/components/Toggle';
import { Select } from '@/components/Select';
import { Input } from '@/components/Input';
import { GlintLogo } from '@/components/GlintLogo';
import { useSettings } from '@/hooks/useSettings';

const TABS = ['General', 'Appearance', 'Voice', 'Hotkeys', 'AI', 'About'] as const;
type Tab = typeof TABS[number];

const COLORS = [
  { id: 'blue', value: '#0078D4' },
  { id: 'purple', value: '#744da9' },
  { id: 'green', value: '#10893e' },
  { id: 'pink', value: '#c239b3' },
  { id: 'red', value: '#e74856' }
];

export const SettingsView: React.FC = () => {
  const { settings, ready, error, updateSetting } = useSettings();
  const [keyDraft, setKeyDraft] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('General');

  // Dynamic Accent Color
  useEffect(() => {
    if (settings?.appearance?.accentColor) {
      document.documentElement.style.setProperty('--color-accent', settings.appearance.accentColor);
    }
  }, [settings?.appearance?.accentColor]);

  const getTabIcon = (tab: Tab) => {
    switch (tab) {
      case 'General':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        );
      case 'Appearance':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.52 3.03 14.8 4.5 15.2C5.3 15.4 6 16.2 6 17C6 18.1 5.1 19 4 19C3.47 19 3 19.47 3 20C3 21.1 3.9 22 5 22H12Z" />
            <circle cx="7.5" cy="10.5" r="1.5" />
            <circle cx="11.5" cy="7.5" r="1.5" />
            <circle cx="16.5" cy="9.5" r="1.5" />
            <circle cx="15.5" cy="14.5" r="1.5" />
          </svg>
        );
      case 'Voice':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        );
      case 'Hotkeys':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
            <line x1="6" y1="8" x2="6.01" y2="8" />
            <line x1="10" y1="8" x2="10.01" y2="8" />
            <line x1="14" y1="8" x2="14.01" y2="8" />
            <line x1="18" y1="8" x2="18.01" y2="8" />
            <line x1="6" y1="12" x2="6.01" y2="12" />
            <line x1="18" y1="12" x2="18.01" y2="12" />
            <rect x="10" y="12" width="4" height="1.5" rx="0.5" />
            <line x1="7" y1="16" x2="7.01" y2="16" />
            <rect x="10" y="16" width="6" height="1.5" rx="0.5" />
            <line x1="17" y1="16" x2="17.01" y2="16" />
          </svg>
        );
      case 'AI':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 1 7.54 16.59l-1.42-1.42A8 8 0 1 0 12 20v2a10 10 0 0 1-10-10C2 6.48 6.48 2 12 2z" />
            <path d="M12 6a6 6 0 0 1 6 6h-2a4 4 0 1 0-4 4v2a6 6 0 0 1-6-6h2a4 4 0 0 0 4-4z" />
            <circle cx="12" cy="12" r="1.5" />
          </svg>
        );
      case 'About':
        return (
          <svg className="settings-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
      default:
        return null;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'General':
        return (
          <div className="settings-section animate-scale-in">
            <h2 className="settings-section-title">General Settings</h2>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Launch at Startup</span>
                  <span className="settings-desc">Startup registration is unavailable in this build</span>
                </div>
                <Toggle disabled
                  checked={false}
                  onChange={(v) => updateSetting('general', 'launchAtStartup', v)} 
                />
              </div>
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Always on Top</span>
                  <span className="settings-desc">The assistant stays above other windows</span>
                </div>
                <Toggle disabled
                  checked={true}
                  onChange={(v) => updateSetting('general', 'alwaysOnTop', v)} 
                />
              </div>
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Guidance Level</span>
                  <span className="settings-desc">Choose how much visual assistance is active</span>
                </div>
                <Select 
                  value={settings?.general?.guidanceLevel ?? 'minimal'} 
                  onChange={(v) => updateSetting('general', 'guidanceLevel', v)}
                  options={[
                    { value: 'minimal', label: 'Minimal (Conversational Text)' },
                    { value: 'standard', label: 'Standard (Visual Guidance)' }
                  ]}
                />
              </div>
            </div>
          </div>
        );
      case 'Appearance':
        return (
          <div className="settings-section animate-scale-in">
            <h2 className="settings-section-title">Appearance Settings</h2>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Theme</span>
                  <span className="settings-desc">This build uses the dark theme</span>
                </div>
                <Select 
                  disabled value="dark"
                  onChange={(v) => updateSetting('appearance', 'theme', v)}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' }
                  ]}
                />
              </div>
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Accent Color</span>
                  <span className="settings-desc">Personalize Glint's primary color</span>
                </div>
                <div className="color-swatches">
                  {COLORS.map(c => (
                    <button 
                      key={c.id} 
                      className={`color-swatch ${(settings?.appearance?.accentColor || '#0078D4') === c.value ? 'active' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => updateSetting('appearance', 'accentColor', c.value)}
                      aria-label={`Select ${c.id} accent color`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'Voice':
        return (
          <div className="settings-section animate-scale-in">
            <h2 className="settings-section-title">Voice Settings</h2>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Local dictation</span>
                  <span className="settings-desc">Choose English or Tamil in the assistant, then use its microphone. Recordings are transcribed on this computer.</span>
                </div>
              </div>
            </div>
          </div>
        );
      case 'Hotkeys':
        return (
          <div className="settings-section animate-scale-in">
            <h2 className="settings-section-title">Hotkeys Settings</h2>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Activation Shortcut</span>
                  <span className="settings-desc">Shortcut to open the Glint floating assistant</span>
                </div>
                <div className="shortcut-keys">
                  <kbd>Ctrl</kbd>
                  <span className="kbd-plus">+</span>
                  <kbd>Shift</kbd>
                  <span className="kbd-plus">+</span>
                  <kbd>Space</kbd>
                </div>
              </div>
            </div>
          </div>
        );
      case 'AI':
        return (
          <div className="settings-section animate-scale-in">
            <h2 className="settings-section-title">AI Engine Settings</h2>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-label-group">
                  <span className="settings-label">Provider</span>
                  <span className="settings-desc">{settings.ai.hosted
                    ? 'Screen guidance sends the goal and screen image to Google Gemini through the Glint relay'
                    : 'Screen guidance sends the goal and screen image to Google Gemini'}</span>
                </div>
                <span>Google Gemini</span>
              </div>
              {settings.ai.hosted ? (
                <div className="settings-row">
                  <div className="settings-label-group">
                    <span className="settings-label">Connection</span>
                    <span className="settings-desc">Online AI is configured for this Glint build</span>
                  </div>
                  <span>Hosted</span>
                </div>
              ) : (
                <>
                  <div className="settings-row">
                    <div className="settings-label-group">
                      <span className="settings-label">Model</span>
                      <span className="settings-desc">Select primary Gemini vision model (Auto-fallback enabled)</span>
                    </div>
                    <Select
                      value={settings?.ai?.model ?? 'gemini-3.1-flash-lite'}
                      onChange={(v) => updateSetting('ai', 'model', v)}
                      options={[
                        { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fastest & Stable)' },
                        { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (High RPM)' },
                        { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (High Intelligence)' },
                        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Standard)' }
                      ]}
                    />
                  </div>
                  <div className="settings-row align-top">
                    <div className="settings-label-group">
                      <span className="settings-label">API Key</span>
                      <span className="settings-desc">Required for AI-powered navigation guidance</span>
                    </div>
                    <div className="api-key-input-wrapper">
                      <Input
                        type="password"
                        value={keyDraft}
                        onChange={setKeyDraft}
                        aria-label="Gemini API key"
                        placeholder={settings.ai.hasApiKey ? 'Saved key' : 'Enter your API key'}
                      />
                      <button disabled={!keyDraft.trim()} onClick={async () => {
                        if (await updateSetting('ai', 'apiKey', keyDraft)) setKeyDraft('');
                      }}>Save key</button>
                      {settings.ai.hasApiKey && <button onClick={() => updateSetting('ai', 'apiKey', '')}>Remove key</button>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      case 'About':
        return (
          <div className="settings-section about-section animate-scale-in">
            <GlintLogo size={48} animated={true} />
            <h2 className="about-title">Glint</h2>
            <p className="about-version">Version 1.0.0</p>
            <p className="about-desc">AI-powered desktop navigation assistant</p>
            <div className="about-divider" />
            <p className="about-copyright">&copy; 2026 Glint. All rights reserved.</p>
          </div>
        );
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-sidebar">
        <h1 className="settings-title">Glint</h1>
        <nav className="settings-nav">
          {TABS.map(tab => (
            <button 
              key={tab} 
              className={`settings-nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {getTabIcon(tab)}
              <span>{tab}</span>
            </button>
          ))}
        </nav>
        <div className="settings-version">Version 1.0.0</div>
      </div>
      <div className="settings-content">
        {error && <p role="alert">{error}</p>}
        {ready ? renderContent() : !error && <p>Loading settings…</p>}
      </div>
    </div>
  );
};
