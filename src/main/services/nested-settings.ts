import { screen } from 'electron'
import { auditAutomation } from './automation-audit'
import { normalizeRequest } from './native-action'
import { openSettings } from './settings-adapter'
import { settingsHeadings, type SettingsDestination } from './settings-destinations'
import { isPageHeading, sameTarget, UiaError, type Element, type ElementRef, type Selector, type WindowsUia } from './windows-uia'

const settings = { kind: 'settings' } as const
const foreground = { kind: 'foreground' } as const
const button = (names: string[], ancestor: string): Selector => ({ names, ancestor, types: ['Button'] })
const advancedNames = ['Advanced display', 'Advanced display settings', 'மேம்பட்ட காட்சி']
const historyNames = ['Update history', 'புதுப்பிப்பு வரலாறு']
const proxyNames = ['Proxy', 'ப்ராக்ஸி']
const advancedLink = { names: advancedNames, types: ['Button', 'Hyperlink'], ancestor: 'Related settings' } as const
const displayInfo = { names: ['Display information', 'காட்சி தகவல்'], types: ['Text'], ancestor: 'Display information' } as const
const drr = { automationId: 'SystemSettings_Display_AdvancedDisplaySettingsDynamicRefreshRate_ToggleSwitch',
  types: ['Button', 'CheckBox'], ancestor: 'Refresh rate' } as const
const refreshRate = { automationId: 'SystemSettings_Display_AdvancedDisplaySettingsRefreshRate_ComboBox',
  types: ['ComboBox'], ancestor: 'Display information' } as const

type Route = {
  label: string
  start: SettingsDestination
  aliases: readonly string[]
  final?: Selector
  link?: { selector: Selector; page: readonly string[] }
}
export const nestedSettings = {
  drr: { label: 'Dynamic refresh rate', start: 'display',
    aliases: ['dynamic refresh rate', 'drr', 'டைனமிக் ரெஃப்ரெஷ் ரேட்', 'மாறும் புதுப்பிப்பு வீதம்', 'டைனமிக் ரிப்ரெஷ் ரேட்'] },
  resolution: { label: 'Display resolution', start: 'display',
    aliases: ['display resolution', 'screen resolution', 'திரை தெளிவுத்திறன்', 'திரை ரெசல்யூஷன்'],
    final: { names: ['Display resolution', 'காட்சி தெளிவுத்திறன்'], types: ['ComboBox'], ancestor: 'Scale & layout' } },
  displayInfo: { label: 'Display information', start: 'display',
    aliases: [...advancedNames, 'advanced display information', 'display information', 'advanced screen details', 'மேம்பட்ட காட்சி தகவல்'],
    link: { selector: advancedLink, page: advancedNames }, final: displayInfo },
  microphone: { label: 'Microphone access', start: 'microphonePrivacy',
    aliases: ['microphone permissions', 'mic permissions', 'microphone access', 'மைக்ரோஃபோன் அனுமதிகள்', 'ஒலிவாங்கி அனுமதிகள்'],
    final: { automationId: 'SystemSettings_CapabilityAccess_Microphone_SystemGlobal_ToggleSwitch', types: ['Button', 'CheckBox'] } },
  output: { label: 'Default audio output', start: 'sound',
    aliases: ['default audio output device', 'default output device', 'default audio output', 'sound output device', 'இயல்புநிலை ஒலி வெளியீடு'],
    final: { automationId: 'SystemSettings_Audio_OutputCollectionHeader_EntityItem', types: ['Group'], ancestor: 'Output' } },
  proxy: { label: 'Proxy settings', start: 'network',
    aliases: ['proxy', 'proxy settings', 'ப்ராக்ஸி அமைப்புகள்'],
    link: { selector: { names: proxyNames, types: ['ListItem', 'Button', 'Hyperlink'], ancestor: 'settingPagesList' }, page: proxyNames } },
  vpn: { label: 'VPN settings', start: 'vpn', aliases: ['vpn settings', 'vpn connections', 'விபிஎன் அமைப்புகள்'],
    final: { names: ['VPN connections'], types: ['Group'], ancestor: 'ItemsControlScrollViewer' } },
  startup: { label: 'Startup apps', start: 'startupApps',
    aliases: ['startup apps', 'startup applications', 'apps that start automatically', 'தொடக்க செயலிகள்'] },
  updateHistory: { label: 'Update history', start: 'windowsUpdate',
    aliases: ['update history', 'windows update history', 'windows update log', 'விண்டோஸ் புதுப்பிப்பு வரலாறு', 'புதுப்பிப்பு வரலாறு'],
    link: { selector: button(historyNames, 'SystemSettings_MusUpdate_UpdateHistoryLink_ButtonEntityItem'), page: historyNames } },
  mouse: { label: 'Mouse Properties', start: 'mouse',
    aliases: ['advanced mouse settings', 'additional mouse settings', 'mouse properties', 'மேம்பட்ட சுட்டி அமைப்புகள்'] }
} as const satisfies Record<string, Route>

export type NestedSettingsId = keyof typeof nestedSettings
type ToggleState = 'On' | 'Off'
type GoalMatch = { id: NestedSettingsId; desired?: ToggleState; advice?: ToggleState }
export type PendingSetting = { ref: ElementRef; before: 'On' | 'Off'; after: 'On' | 'Off'; expires: number; display: string }

const goalNames = new Map<string, NestedSettingsId>(Object.entries(nestedSettings).flatMap(([id, route]) =>
  route.aliases.map(alias => [normalizeRequest(alias), id as NestedSettingsId])))
const navigationPrefix = /^(?:(?:can|could|would) you (?:please )?|how (?:do|can) i |where (?:do|can) i )?(?:find|locate|open|show(?: me)?|take me to|go to|navigate to|where is|where are|where(?:'s)) /u
const targetSuffix = /(?: for (?:my|this|the) (?:display|screen|monitor)| in (?:windows(?: 11)?(?: settings)?|settings)| அமைப்புகளைத் திறக்கவும்| அமைப்புகளைக் காட்டு| எங்கே(?: இருக்கு)?| காட்டு| திறக்கவும்| எப்படி (?:இயக்குவது|open பண்றது))+$/u

export function nestedSettingsGoal(goal: string): GoalMatch | undefined {
  const text = normalizeRequest(goal).replace(/[.!?]+$/u, '')
    .replace(/^(?:(?:hey|ok|okay) )?glint,? /u, '').replace(/^(?:please,? |தயவுசெய்து )/u, '')
  const change = /^(enable|disable|turn on|turn off) (.+)$/u.exec(text)
  const question = /^(?:how (?:to|do i|can i) |show me how to )(enable|disable|turn on|turn off) (.+)$/u.exec(text)
  const navigate = navigationPrefix.test(text) || targetSuffix.test(text)
  if (!change && !question && !navigate) return
  const target = (change?.[2] ?? question?.[2] ?? text.replace(navigationPrefix, '')).replace(/^(?:the|my) /u, '')
    .replace(targetSuffix, '').replace(/ (?:settings page|page|option|control)$/u, '')
  const id = goalNames.get(target) ?? goalNames.get(target.replace(/ settings$/u, ''))
  if (!id || ((change || question) && id !== 'drr')) return
  const verb = change?.[1] ?? question?.[1]
  const state = verb ? (['enable', 'turn on'].includes(verb) ? 'On' : 'Off') : undefined
  return { id, desired: change ? state : undefined, advice: question ? state : undefined }
}

async function page(uia: WindowsUia, names: readonly string[], label: string) {
  return uia.waitFor(settings, { names }, label, isPageHeading)
}

async function start(uia: WindowsUia, route: Route, run: string) {
  auditAutomation(run, 'settings.open', 'attempted', { target: route.start })
  const text = await openSettings(route.start, uia.signal, true)
  auditAutomation(run, 'settings.open', 'verified', { target: route.start, result: 'native page observed' })
  const heading = await page(uia, settingsHeadings(route.start), route.start)
  return { text, heading }
}

async function follow(uia: WindowsUia, from: ElementRef, selector: Selector, label: string, names: readonly string[]) {
  const link = await uia.waitFor(settings, selector, label, item => item.enabled && !isPageHeading(item), 2, from.window)
  // Require the old page again immediately before dispatch, including recovery.
  const check = () => uia.waitFor(settings, from.selector, 'source page', isPageHeading, 1, from.window)
  await check()
  return uia.navigate(link, 'invoke', label,
    before => uia.waitFor(settings, { names }, label, isPageHeading, 3, before.window))
}

async function activeDisplay(uia: WindowsUia, binding: ElementRef['window']) {
  const { window, items } = await uia.inspect(settings, { types: ['Group'], ancestor: 'Display information' }, 'selected display')
  if (window.handle !== binding.handle || window.process !== binding.process) return ''
  // The display details group has the current display name and contains the
  // observed "Variable refresh rate" field. No device name is logged or sent.
  const details = await uia.waitFor(settings, { names: ['Variable refresh rate'], types: ['Text'], ancestor: 'Display information' },
    'selected display details', item => item.visible, 1, binding).catch(error => {
    if (!(error instanceof UiaError)) throw error
  })
  const display = details?.element.parents.find(parent => parent.type === 'Group' && parent.name !== 'Display information')?.name
  if (!display || !items.some(item => item.name === display)) return ''
  const monitors = screen.getAllDisplays()
  if (monitors.length === 1) return JSON.stringify([monitors[0].id, display])
  const choices = await uia.inspect(settings, { types: ['ComboBox'] }, 'display selector', true)
  if (choices.window.handle !== binding.handle || choices.window.process !== binding.process) return ''
  const selectors = choices.items.filter(item =>
    /select a display|choose a display/i.test(item.name) || /monitor.*combobox/i.test(item.automationId))
  const selected = selectors.length === 1 && (selectors[0].state.selection?.[0] || selectors[0].state.value)
  return selected && /\bdisplay\s*\d|^\d/u.test(selected.toLowerCase())
    ? JSON.stringify([monitors.map(monitor => monitor.id).sort(), display, selected]) : ''
}

async function dynamicRefresh(uia: WindowsUia, advanced: ElementRef, desired?: ToggleState, advice?: ToggleState) {
  const control = await uia.waitFor(settings, drr, 'Dynamic refresh rate', () => true, 2, advanced.window).catch(error => {
    if (!(error instanceof UiaError) || error.reason !== 'missing') throw error
  })
  if (control) {
    const ref = await uia.highlight(control, 'Dynamic refresh rate')
    const state = ref.element.state.toggle
    if (!ref.element.enabled) {
      return { text: 'Advanced display is open. Windows exposes Dynamic refresh rate but has disabled it for the selected display.' }
    }
    if (state !== 'On' && state !== 'Off') {
      return { text: 'Advanced display is open and Dynamic refresh rate is highlighted. Windows did not expose its current on/off state.' }
    }
    const value = state.toLowerCase()
    if (!desired) {
      const instruction = advice && advice !== state ? ` Turn the highlighted switch ${advice.toLowerCase()}.` : ''
      return { text: `Advanced display is open. Dynamic refresh rate is highlighted and is ${value}.${instruction}` }
    }
    if (desired === state) return { text: `Dynamic refresh rate is already ${value}. The switch is highlighted.` }
    const display = await activeDisplay(uia, advanced.window)
    if (!display) return { text: `Dynamic refresh rate is ${value}. It is highlighted for you to change. Glint could not verify the display identity for an automatic change.` }
    return { text: `Dynamic refresh rate is ${value}. Reply “Confirm Dynamic Refresh Rate” within two minutes to turn it ${desired.toLowerCase()}.`,
      pending: { ref, before: state, after: desired, expires: Date.now() + 120000, display } satisfies PendingSetting }
  }

  const chooser = await uia.waitFor(settings, refreshRate, 'refresh-rate chooser', () => true, 2, advanced.window)
  if (!chooser.element.enabled || !chooser.element.patterns.includes('ExpandCollapse')) {
    await uia.highlight(chooser, 'Refresh rate')
    return { text: 'Advanced display is open. Windows did not expose a Dynamic refresh rate switch or an inspectable refresh-rate list for the selected display.' }
  }
  const verifyExpansion = (before: ElementRef, state: 'Expanded' | 'Collapsed') =>
    uia.waitFor(settings, refreshRate, 'refresh-rate chooser', item =>
      sameTarget(item, before.element) && item.state.expanded === state, 2, before.window)
  const expanded = await uia.navigate(chooser, 'expand', 'refresh-rate choices', before => verifyExpansion(before, 'Expanded'))
  const { items } = await uia.inspect(settings, { types: ['ListItem', 'RadioButton'], ancestor: chooser.element.name },
    'refresh-rate choices')
  const rates = items.filter(item => /\bHz\b/iu.test(item.name))
  const dynamic = rates.filter(item => /\bdynamic\b/iu.test(item.name))
  if (dynamic.length === 1) {
    const item = dynamic[0]
    await uia.highlight({ ...expanded, selector: { names: [item.name], ancestor: chooser.element.name }, element: item },
      'Dynamic refresh rate option')
    return { text: 'Advanced display is open. The Dynamic refresh rate option is highlighted in the refresh-rate list. ' +
      (advice === 'Off' ? 'Choose a fixed refresh rate to turn Dynamic refresh rate off.' : 'Select the highlighted option to enable it.') }
  }
  const collapsed = await uia.navigate(expanded, 'collapse', 'refresh-rate choices', before => verifyExpansion(before, 'Collapsed'))
  await uia.highlight(collapsed, 'Refresh rate')
  return { text: rates.length && !dynamic.length
    ? 'Advanced display is open. The selected display’s refresh-rate list has no Dynamic option, and Windows exposes no Dynamic refresh rate switch.'
    : 'Advanced display is open. Windows did not expose a switch or a unique Dynamic refresh rate option that Glint could verify.' }
}

export async function runNestedSettings(uia: WindowsUia, id: NestedSettingsId, run: string,
  desired?: ToggleState, advice?: ToggleState) {
  const route: Route = nestedSettings[id]
  auditAutomation(run, 'settings.goal', 'planned', { goal: id, target: route.label })
  if (id === 'drr') {
    auditAutomation(run, 'settings.open', 'attempted', { target: 'home' })
    await openSettings('home', uia.signal)
    auditAutomation(run, 'settings.open', 'verified', { target: 'home', result: 'Settings window observed' })
  }
  const { heading } = await start(uia, route, run)

  if (id === 'mouse') {
    const mouse = button(['Additional mouse settings', 'Additional mouse options'], 'Related settings')
    const link = await uia.waitFor(settings, mouse, 'Additional mouse settings', item => item.enabled, 2, heading.window)
    const dialog = await uia.navigate(link, 'invoke', 'Additional mouse settings', async before => {
      const buttons = await uia.waitFor(foreground, { names: ['Buttons'], types: ['Pane', 'TabItem'] }, 'Mouse Properties',
        item => item.visible, 3)
      // This is the Settings link's legacy Control Panel dialog, not a
      // coincidental Buttons tab in a different foreground window.
      const { process, handle, className, name, executable } = buttons.window
      if (handle === before.window.handle || className !== '#32770' || name !== 'Mouse Properties' ||
          !['rundll32', 'control'].includes(executable?.toLowerCase() ?? '')) {
        throw new UiaError('wrong-dialog', 'Glint could not verify the Mouse Properties dialog.')
      }
      return { ...buttons, scope: { kind: 'observed', process, handle } }
    })
    await uia.highlight(dialog, 'Mouse Properties')
    return { text: 'Mouse Properties is open and highlighted on the Buttons tab.' }
  }
  if (id === 'drr') {
    const advanced = await follow(uia, heading, advancedLink, 'Advanced display', advancedNames)
    return dynamicRefresh(uia, advanced, desired, advice)
  }
  const destination = route.link ? await follow(uia, heading, route.link.selector, route.label, route.link.page) : heading
  const target = route.final ? await uia.waitFor(settings, route.final, route.label, () => true, 3, destination.window) : destination
  const { element } = await uia.highlight(target, route.label)
  const selection = element.state.selection?.[0]
  const state = element.state.toggle?.toLowerCase()
  const output = id === 'output' ? /\.\s*([^\.]+?) selected\./iu.exec(element.name)?.[1] : undefined
  const value = selection || state || output
  return { text: `${route.label} is highlighted in Windows Settings.${value ? ` Current setting: ${value}.` : ''}` }
}

export async function confirmSetting(uia: WindowsUia, pending: PendingSetting, run: string) {
  auditAutomation(run, 'settings.confirm', 'attempted', { goal: 'drr', target: 'Dynamic refresh rate' })
  const { heading } = await start(uia, nestedSettings.drr, run)
  const advanced = await follow(uia, heading, advancedLink, 'Advanced display', advancedNames)
  if (await activeDisplay(uia, advanced.window) !== pending.display) {
    throw new UiaError('display-changed', 'The selected display changed. Ask Glint to locate Dynamic refresh rate again.')
  }
  const refreshed = await uia.waitFor(settings, drr, 'Dynamic refresh rate',
    item => sameTarget(item, pending.ref.element) && item.enabled, 2, advanced.window)
  const verified = await uia.toggle(refreshed, 'Dynamic refresh rate', pending.before, pending.after)
  if (await activeDisplay(uia, verified.window) !== pending.display) {
    throw new UiaError('display-changed', 'The selected display changed before Glint could confirm the result.')
  }
  await uia.highlight(verified, 'Dynamic refresh rate')
  return { text: `Windows verified that Dynamic refresh rate is now ${pending.after.toLowerCase()}.` }
}
