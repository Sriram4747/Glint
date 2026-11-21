const assert = require('node:assert/strict')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

if (!process.versions.electron) {
  const args = process.argv.slice(2)
  const profile = mkdtempSync(join(tmpdir(), 'glint-navigation-test-'))
  const env = { ...process.env }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GEMINI_API_KEY']) delete env[key]
  const test = spawnSync(require('electron'), [__filename, profile, ...args], {
    cwd: profile, env, timeout: 60000, stdio: 'inherit', windowsHide: true
  })
  if (test.error) throw test.error
  process.exit(test.status ?? 1)
}

// The catalog here is independent of the production catalog so a bad mapping fails.
const pages = [
  ['Wi-Fi', 'wireless network', 'வைஃபை', 'network-wifi'],
  ['Bluetooth', 'Bluetooth & devices', 'புளூடூத்', 'bluetooth'],
  ['Display', 'screen', 'திரை', 'display'],
  ['Sound', 'audio', 'ஒலி', 'sound'],
  ['Windows Update', 'Windows updates', 'விண்டோஸ் அப்டேட்', 'windowsupdate'],
  ['Installed apps', 'apps and features', 'நிறுவப்பட்ட செயலிகள்', 'appsfeatures'],
  ['Default apps', 'default applications', 'இயல்புநிலை செயலிகள்', 'defaultapps'],
  ['Storage', 'disk storage', 'சேமிப்பகம்', 'storagesense'],
  ['About PC', 'about this PC', 'கணினி விவரங்கள்', 'about'],
  ['Microphone privacy', 'mic privacy', 'மைக்ரோஃபோன் தனியுரிமை', 'privacy-microphone'],
  ['Network & internet', 'network and internet', 'பிணையம் மற்றும் இணையம்', 'network-status'],
  ['VPN', 'virtual private network', 'வி பி என்', 'network-vpn'],
  ['Printers & scanners', 'printers and scanners', 'அச்சுப்பொறிகள்', 'printers'],
  ['Mouse', 'mouse preferences', 'மவுஸ்', 'mousetouchpad'],
  ['Notifications', 'notification', 'அறிவிப்புகள்', 'notifications'],
  ['Clipboard', 'clipboard history', 'கிளிப்போர்டு', 'clipboard'],
  ['Multitasking', 'multi-tasking', 'பல்பணி', 'multitasking'],
  ['Background', 'desktop background', 'பின்னணி', 'personalization-background'],
  ['Date & time', 'date and time', 'தேதி மற்றும் நேரம்', 'dateandtime'],
  ['Startup apps', 'startup applications', 'தொடக்க செயலிகள்', 'startupapps']
]

const { app, BrowserWindow, Tray, shell, desktopCapturer } = require('electron')
const [profile, mode, scenario] = process.argv.slice(2)
const live = mode === '--live'
app.setPath('userData', profile)
let menu
const setContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (nextMenu) {
  menu = nextMenu
  return setContextMenu.call(this, nextMenu)
}
function tray(label) {
  const item = menu.items.find(item => item.label.startsWith(label))
  assert.ok(item, `Missing tray item ${label}`)
  item.click(item)
}

let requested = []
let failLaunch = false
let blockLaunch = false
let releaseLaunch
const openExternal = shell.openExternal.bind(shell)
shell.openExternal = async uri => {
  requested.push(uri)
  if (live) return openExternal(uri)
  if (failLaunch) throw new Error('Windows launcher fixture rejected this request')
  if (blockLaunch) await new Promise(resolve => { releaseLaunch = resolve })
}
let captures = 0
let modelRequests = 0
desktopCapturer.getSources = async () => { captures++; throw new Error('Unexpected screen capture') }
global.fetch = async () => { modelRequests++; throw new Error('Unexpected network request') }

async function until(check, description) {
  const end = Date.now() + 10000
  do {
    const result = await check()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 40))
  } while (Date.now() < end)
  throw new Error(`Timed out waiting for ${description}`)
}

const run = (window, js) => window.webContents.executeJavaScript(js)
const findWindow = role => until(() => BrowserWindow.getAllWindows().find(window =>
  window.webContents.getURL().endsWith(`?window=${role}`) && !window.webContents.isLoading()), role)

async function enterDraft(assistant, text) {
  await run(assistant, 'document.querySelector("input").focus(); document.querySelector("input").select()')
  await assistant.webContents.insertText(text)
}

const liveCases = new Map([
  ['wifi', { text: 'Open Wi-Fi settings.', uri: 'network-wifi' }],
  ['bluetooth', { text: 'Show me Bluetooth settings.', uri: 'bluetooth' }],
  ['display', { text: 'Take me to display settings.', uri: 'display' }],
  ['sound', { text: 'ஒலி அமைப்புகளைத் திறக்கவும்.', uri: 'sound' }],
  ['update', { text: 'Open Windows Update.', uri: 'windowsupdate' }],
  ['repeat', { text: 'Open Windows Update.', uri: 'windowsupdate', repeat: true }],
  ['ambiguous', { text: 'Open Wi-Fi or Bluetooth settings.', response: 'Which Windows Settings page' }],
  ['unsupported', { text: "Don't open Wi-Fi settings.", response: 'Gemini API key', error: true }]
])

async function runLive(assistant) {
  const check = liveCases.get(scenario)
  assert.ok(check, `Choose a live scenario from ${[...liveCases.keys()].join(', ')}`)
  await until(() => run(assistant, '!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
  await enterDraft(assistant, check.text)
  assert.equal(await run(assistant, 'document.querySelector("input").value'), check.text)
  assert.deepEqual(requested, [])
  await run(assistant, 'document.querySelector(".send-btn").click()')
  const response = check.response || 'Asked Windows'
  const selector = check.error ? '.analysis-error' : '.response-text'
  await until(() => run(assistant, `document.querySelector('${selector}')?.textContent.includes(${JSON.stringify(response)})`), 'live Glint response')
  if (check.repeat) {
    const repeated = await run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(check.text)})`)
    assert.match(repeated.text, /already sent/)
  }
  assert.deepEqual(requested, check.uri ? [`ms-settings:${check.uri}`] : [])
  assert.equal(captures, 0)
  assert.equal(modelRequests, 0)
  console.log(`PASS live ${scenario} / ${check.uri ? `dispatched ms-settings:${check.uri}; inspect the Windows Settings heading` : 'no OS launch'}`)
}

require('../../out/main/index.js')
app.whenReady().then(async () => {
  tray('Open Assistant')
  const assistant = await findWindow('assistant')
  if (live) {
    await runLive(assistant)
    app.quit()
    return
  }
  const submit = (text, language) => run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(language
    ? { source: 'voice', text, final: true, language }
    : { source: 'text', text })})`)
  let passed = 0
  async function test(name, verify) {
    requested = []
    try {
      await verify()
      assert.equal(captures, 0)
      assert.equal(modelRequests, 0)
      passed++
    } catch (error) {
      throw new Error(name, { cause: error })
    }
  }

  // Run positives across the full catalog before revisiting a destination. The
  // repeat check immediately resends the same destination on the other input path.
  const cases = [
    ['direct English', ([name]) => submit(`Open ${name} settings.`)],
    ['alternative English', ([, alias]) => submit(`Can you take me to the ${alias} page in Windows Settings?`)],
    ['Tamil text', ([, , tamil]) => submit(`${tamil} அமைப்புகளைத் திறக்கவும்.`)],
    ['English final transcript', ([name]) => submit(`Show me ${name} settings.`, 'en')],
    ['Tamil final transcript', ([, , tamil]) => submit(`${tamil} settings எப்படி open பண்றது?`, 'ta')],
    ['exact URI for legacy text caller', ([name]) => run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(`Please open ${name}.`)})`)]
  ]
  for (const [label, send] of cases) {
    for (const page of pages) {
      const [name, , , uri] = page
      await test(`${name} / ${label}`, async () => {
        const result = await send(page)
        assert.equal(result.success, true, result.error)
        assert.match(result.text, /Asked Windows/)
        assert.deepEqual(requested, [`ms-settings:${uri}`])
      })
    }
  }

  for (const [name, , tamil, uri] of pages) {
    const other = name === 'Wi-Fi' ? 'Bluetooth' : 'Wi-Fi'
    await test(`${name} / ambiguity`, async () => {
      const result = await submit(`Open ${name} or ${other} settings.`)
      assert.match(result.text, /Which Windows Settings page/)
      assert.deepEqual(requested, [])
    })
    await test(`${name} / unsupported explanation`, async () => {
      const result = await submit(`Explain how to configure ${name} settings.`)
      assert.match(result.error, /API key/)
      assert.deepEqual(requested, [])
    })
    await test(`${name} / launcher failure and retry`, async () => {
      failLaunch = true
      try {
        const result = await submit(`Open ${name} settings.`)
        assert.equal(result.success, false)
        assert.match(result.error, /Windows could not open/)
        assert.deepEqual(requested, [`ms-settings:${uri}`])
      } finally {
        failLaunch = false
      }
      assert.equal((await submit(`Open ${name} settings.`)).success, true)
      assert.deepEqual(requested, [`ms-settings:${uri}`, `ms-settings:${uri}`])
    })
    await test(`${name} / repeated request`, async () => {
      const result = await submit(`${tamil} settings திற.`, 'ta')
      assert.match(result.text, /already sent/)
      assert.deepEqual(requested, [])
    })
  }

  for (const text of [
    "Don't open Wi-Fi settings.", 'Explain what Bluetooth is.', 'Can you show me how Wi-Fi works?',
    'Show me how to open Bluetooth settings.', 'Turn off Wi-Fi.', 'Pair my Bluetooth headphones.',
    'Open Wi-Fi settings and turn it off.', 'Open Wi-Fi settings; start calc.exe',
    'Open Wi-Fi settings && ms-settings:windowsupdate', 'Open ms-settings:display',
    'Open Wi-Fi settings\nOpen Sound settings', 'Open https://example.invalid',
    'Open Advanced display settings.', 'வைஃபை அமைப்புகளைத் திறக்க வேண்டாம்.',
    'புளூடூத் அமைப்புகளைத் திறப்பது எப்படி என்று விளக்கவும்.'
  ]) {
    await test(`must not launch / ${text}`, async () => {
      assert.match((await submit(text)).error, /API key/)
      assert.deepEqual(requested, [])
    })
  }

  await test('generic and Tamil ambiguity', async () => {
    assert.match((await submit('Open Windows Settings.')).text, /Which Windows Settings page/)
    assert.match((await submit('வைஃபை அல்லது புளூடூத் அமைப்புகள் திறக்கவும்.', 'ta')).text, /Which Windows Settings page/)
    assert.deepEqual(requested, [])
  })
  await test('mixed Tamil and English shortcut phrases', async () => {
    assert.equal((await submit('Bluetooth settings எப்படி open பண்றது?', 'ta')).success, true)
    assert.equal((await submit('Wi-Fi settings திற.')).success, true)
    assert.deepEqual(requested, ['ms-settings:bluetooth', 'ms-settings:network-wifi'])
  })
  await test('partial voice and forged action payload', async () => {
    for (const input of [
      { source: 'voice', text: 'Open Wi-Fi settings', final: false, language: 'en' },
      { source: 'action', text: 'Open Wi-Fi settings', destination: 'wifi', uri: 'ms-settings:network-wifi' }
    ]) {
      const result = await run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(input)})`)
      assert.equal(result.success, false)
    }
    assert.deepEqual(requested, [])
  })
  await test('concurrent launches', async () => {
    blockLaunch = true
    const first = submit('Open Bluetooth settings.')
    try {
      await until(() => releaseLaunch, 'in-flight launch')
      assert.match((await submit('Open Bluetooth settings.', 'en')).text, /already in progress/)
      assert.match((await submit('Open Display settings.')).error, /Wait for the current/)
      assert.deepEqual(requested, ['ms-settings:bluetooth'])
    } finally {
      blockLaunch = false
      releaseLaunch?.()
    }
    assert.equal((await first).success, true)
  })
  await test('native routing is assistant-only and takes priority in L2', async () => {
    tray('Settings')
    const settings = await findWindow('settings')
    await assert.rejects(run(settings, `glintAPI.executeGoalStep('Open Sound settings')`), /cannot perform/)
    await run(settings, `glintAPI.saveSettings({general: {guidanceLevel: 'standard'}, ai: {apiKey: 'local-fixture-only'}})`)
    settings.close()
    tray('Open Assistant')
    const result = await submit('Open Sound settings.')
    assert.equal(result.success, true)
    assert.deepEqual(requested, ['ms-settings:sound'])
  })
  await test('typed draft is editable and waits for Send', async () => {
    await until(() => run(assistant, '!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
    await enterDraft(assistant, 'Open Wi-Fi settings.')
    assert.deepEqual(requested, [])
    await enterDraft(assistant, 'Take me to Display settings.')
    await run(assistant, 'document.querySelector(".send-btn").click(); document.querySelector(".send-btn").click()')
    await until(() => run(assistant, 'document.querySelector(".response-text")?.textContent.includes("Asked Windows to open Display")'), 'visible launch response')
    assert.deepEqual(requested, ['ms-settings:display'])
  })
  console.log(`PASS ${passed} navigation cases across ${pages.length} destinations (Electron, Windows launch fixture).`)
  app.quit()
}).catch(error => {
  console.error(error)
  app.exit(1)
})
