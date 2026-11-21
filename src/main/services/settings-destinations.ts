// Settings pages opened and inspected on Windows 11. Each URI is owned by main.
// https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings
export const settingsDestinations = {
  wifi: {
    label: 'Wi-Fi', uri: 'ms-settings:network-wifi',
    aliases: ['wifi', 'wi fi', 'wireless network', 'வைஃபை', 'வை-ஃபை', 'வை ஃபை', 'வைபை']
  },
  bluetooth: {
    label: 'Bluetooth', uri: 'ms-settings:bluetooth',
    aliases: ['blue tooth', 'bluetooth & devices', 'bluetooth and devices', 'புளூடூத்', 'ப்ளூடூத்', 'ப்ளூடூத் சாதனங்கள்']
  },
  display: {
    label: 'Display', uri: 'ms-settings:display',
    aliases: ['screen', 'திரை', 'காட்சி', 'டிஸ்ப்ளே']
  },
  sound: {
    label: 'Sound', uri: 'ms-settings:sound',
    aliases: ['audio', 'ஒலி', 'சவுண்ட்', 'ஆடியோ']
  },
  windowsUpdate: {
    label: 'Windows Update', uri: 'ms-settings:windowsupdate',
    aliases: ['windows updates', 'விண்டோஸ் அப்டேட்', 'விண்டோஸ் புதுப்பிப்பு', 'விண்டோஸ் புதுப்பிப்புகள்']
  },
  installedApps: {
    label: 'Installed apps', uri: 'ms-settings:appsfeatures',
    aliases: ['apps & features', 'apps and features', 'நிறுவப்பட்ட செயலிகள்', 'நிறுவப்பட்ட பயன்பாடுகள்']
  },
  defaultApps: {
    label: 'Default apps', uri: 'ms-settings:defaultapps',
    aliases: ['default applications', 'இயல்புநிலை செயலிகள்', 'இயல்புநிலை பயன்பாடுகள்']
  },
  storage: {
    label: 'Storage', uri: 'ms-settings:storagesense',
    aliases: ['disk storage', 'சேமிப்பகம்', 'சேமிப்பு', 'ஸ்டோரேஜ்']
  },
  aboutPc: {
    label: 'About PC', uri: 'ms-settings:about',
    aliases: ['about this pc', 'about my pc', 'pc info', 'கணினி விவரங்கள்', 'இந்த கணினி பற்றி']
  },
  microphonePrivacy: {
    label: 'Microphone privacy', uri: 'ms-settings:privacy-microphone',
    aliases: ['microphone permissions', 'mic privacy', 'மைக்ரோஃபோன் தனியுரிமை', 'ஒலிவாங்கி தனியுரிமை']
  },
  network: {
    label: 'Network & internet', uri: 'ms-settings:network-status',
    aliases: ['network and internet', 'network status', 'இணையம் மற்றும் நெட்வொர்க்', 'பிணையம் மற்றும் இணையம்']
  },
  vpn: {
    label: 'VPN', uri: 'ms-settings:network-vpn',
    aliases: ['virtual private network', 'வி பி என்', 'விபிஎன்']
  },
  printers: {
    label: 'Printers & scanners', uri: 'ms-settings:printers',
    aliases: ['printers and scanners', 'printers', 'அச்சுப்பொறிகள்', 'பிரிண்டர்']
  },
  mouse: {
    label: 'Mouse', uri: 'ms-settings:mousetouchpad',
    aliases: ['mouse preferences', 'மவுஸ்', 'சுட்டி']
  },
  notifications: {
    label: 'Notifications', uri: 'ms-settings:notifications',
    aliases: ['system notifications', 'notification', 'அறிவிப்புகள்', 'நோட்டிபிகேஷன்']
  },
  clipboard: {
    label: 'Clipboard', uri: 'ms-settings:clipboard',
    aliases: ['clipboard history', 'கிளிப்போர்டு', 'கிளிப்போர்டு வரலாறு']
  },
  multitasking: {
    label: 'Multitasking', uri: 'ms-settings:multitasking',
    aliases: ['multi-tasking', 'பல்பணி', 'மல்டிடாஸ்கிங்']
  },
  background: {
    label: 'Background', uri: 'ms-settings:personalization-background',
    aliases: ['desktop background', 'wallpaper', 'பின்னணி', 'வால்பேப்பர்']
  },
  dateTime: {
    label: 'Date & time', uri: 'ms-settings:dateandtime',
    aliases: ['date and time', 'time and date', 'தேதி மற்றும் நேரம்', 'நேரம் மற்றும் தேதி']
  },
  startupApps: {
    label: 'Startup apps', uri: 'ms-settings:startupapps',
    aliases: ['startup applications', 'தொடக்க செயலிகள்', 'தொடக்க பயன்பாடுகள்']
  }
} as const

export type SettingsDestination = keyof typeof settingsDestinations
