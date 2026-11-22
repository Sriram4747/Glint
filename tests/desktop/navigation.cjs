const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const childProcess = require('node:child_process')
const { promisify } = require('node:util')

if (!process.versions.electron) {
  const args = process.argv.slice(2)
  const profile = mkdtempSync(join(tmpdir(), 'glint-navigation-test-'))
  const env = { ...process.env }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GEMINI_API_KEY']) delete env[key]
  const test = childProcess.spawnSync(require('electron'), [__filename, profile, ...args], {
    cwd: profile, env, timeout: args[0]?.startsWith('--nested') ? 360000 : 150000, stdio: 'inherit', windowsHide: true
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

const { app, BrowserWindow, Tray, shell, desktopCapturer, screen } = require('electron')
const [profile, mode, scenario] = process.argv.slice(2)
const nested = ['--nested-fixture', '--nested-live'].includes(mode)
const agent = nested || ['--agent', '--agent-live', '--provider-live'].includes(mode)
const live = ['--live', '--agent-live', '--provider-live', '--nested-live'].includes(mode)
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
let explorerRequests = []
let explorerChecks = []
let revealed = []
let failLaunch = false
let blockLaunch = false
let releaseLaunch
let explorerStatus = 'verified'
let settingsStatus = 'verified'
let settingsChecks = []
let modelReply
let scriptFixture
let uiaChecks = []
const knownFolders = {
  downloads: join(profile, 'Redirected Downloads'),
  documents: join(profile, 'Documents'),
  pictures: join(profile, 'Pictures'),
  desktop: join(profile, 'Desktop'),
  videos: join(profile, 'Videos'),
  music: join(profile, 'Music'),
  home: profile
}
const getPath = app.getPath.bind(app)
if (!live || agent) {
  for (const folder of Object.values(knownFolders)) mkdirSync(folder, { recursive: true })
  app.getPath = name => Object.hasOwn(knownFolders, name) ? knownFolders[name] : getPath(name)
}

const execFile = childProcess.execFile
const executeFile = promisify(execFile)
childProcess.execFile = Object.assign((...args) => execFile(...args), {
  [promisify.custom]: async (file, args, options) => {
    const script = args.at(-1)
    const flags = options.env || {}
    if (script?.endsWith('verify-explorer.ps1')) {
      explorerChecks.push(flags.GLINT_EXPLORER_FOLDER)
      if (!live) return { stdout: explorerStatus, stderr: '' }
    }
    if (script?.endsWith('verify-settings.ps1')) {
      settingsChecks.push([flags.GLINT_SETTINGS_URI, flags.GLINT_SETTINGS_RETRY])
      if (!live) return { stdout: failLaunch ? 'no-window' : settingsStatus, stderr: '' }
    }
    const substitute = await scriptFixture?.(script, flags)
    if (substitute !== undefined) return { stdout: substitute, stderr: '' }
    if (!live && script?.endsWith('known-media-folders.ps1')) return { stdout: '{}', stderr: '' }
    const result = await executeFile(file, args, options)
    if (nested && flags.GLINT_UIA_REQUEST) uiaChecks.push({ request: JSON.parse(flags.GLINT_UIA_REQUEST), reply: JSON.parse(result.stdout) })
    return result
  }
})
const openExternal = shell.openExternal.bind(shell)
shell.openExternal = async uri => {
  if (uri === 'shell:MyComputerFolder') explorerRequests.push('')
  else requested.push(uri)
  if (failLaunch) throw new Error('Windows launcher fixture rejected this request')
  if (live) return openExternal(uri)
  if (blockLaunch) await new Promise(resolve => { releaseLaunch = resolve })
}
const openPath = shell.openPath.bind(shell)
shell.openPath = async folder => {
  explorerRequests.push(folder)
  if (live) return openPath(folder)
  return failLaunch ? 'Explorer fixture declined the launch' : ''
}
const showItemInFolder = shell.showItemInFolder.bind(shell)
shell.showItemInFolder = item => {
  revealed.push(item)
  if (live) showItemInFolder(item)
}
let captures = 0
let modelRequests = 0
desktopCapturer.getSources = async () => { captures++; throw new Error('Unexpected screen capture') }
const fetchProvider = global.fetch
global.fetch = async (url, options) => {
  modelRequests++
  if (mode === '--provider-live') return fetchProvider(url, options)
  if (!modelReply) throw new Error('Unexpected network request')
  const body = JSON.parse(options.body)
  assert.ok(body.systemInstruction, 'Automation must run before visual guidance')
  assert.ok(body.generationConfig.responseJsonSchema.properties.decision)
  const reply = modelReply(JSON.parse(body.contents[0].parts[0].text))
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ decision: reply }) }] } }] }))
}

async function until(check, description, timeout = 10000) {
  const end = Date.now() + timeout
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
  ['wifi-context', { text: 'Open the Wi-Fi settings page in Windows Settings.', uri: 'network-wifi' }],
  ['bluetooth', { text: 'Open Windows Settings to the Bluetooth page.', uri: 'bluetooth' }],
  ['display', { text: 'Show me the Display page.', uri: 'display' }],
  ['sound', { text: 'ஒலி அமைப்புகளைத் திறக்கவும்.', uri: 'sound' }],
  ['update', { text: 'Open Windows Update.', uri: 'windowsupdate' }],
  ['repeat', { text: 'Open Windows Update.', uri: 'windowsupdate', repeat: true }],
  ['ambiguous', { text: 'Open Wi-Fi or Bluetooth settings.', response: 'Which Windows Settings page' }],
  ['unsupported', { text: "Don't open Wi-Fi settings.", response: 'Gemini API key', error: true }],
  ['explorer', { text: 'Open File Explorer.', folder: '', response: 'This PC is open in File Explorer' }],
  ['downloads', { text: 'Where are my downloaded files?', folder: 'downloads', response: 'Downloads is open in File Explorer' }],
  ['documents', { text: 'Open File Explorer to my Documents folder.', folder: 'documents', response: 'Documents is open in File Explorer' }],
  ['pictures', { text: 'படங்கள் கோப்புறையைத் திறக்கவும்.', folder: 'pictures', response: 'Pictures is open in File Explorer' }],
  ['home', { text: 'Open Windows Settings.', uri: '', response: 'Windows Settings is open.' }],
  ['microphone', { text: 'Open microphone privacy settings.', uri: 'privacy-microphone' }]
])

async function runLive(assistant) {
  const check = liveCases.get(scenario)
  assert.ok(check, `Choose a live scenario from ${[...liveCases.keys()].join(', ')}`)
  await until(() => run(assistant, '!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
  await enterDraft(assistant, check.text)
  assert.equal(await run(assistant, 'document.querySelector("input").value'), check.text)
  assert.deepEqual(requested, [])
  assert.deepEqual(explorerRequests, [])
  await run(assistant, 'document.querySelector(".send-btn").click()')
  const response = check.response || 'is open in Windows Settings'
  const observed = await until(() => run(assistant, `document.querySelector('.analysis-error, .response-text')?.textContent`), 'live Glint response')
  assert.ok(observed.includes(response), `Expected ${response}; got ${observed}`)
  if (check.error) assert.ok(await run(assistant, '!!document.querySelector(".analysis-error")'))
  if (check.repeat) {
    const repeated = await run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(check.text)})`)
    assert.match(repeated.text, /already verified/)
  }
  assert.deepEqual(requested, check.uri !== undefined ? [`ms-settings:${check.uri}`] : [])
  const expectedFolder = check.folder ? getPath(check.folder) : check.folder
  assert.ok(check.folder === undefined ? explorerRequests.length === 0 :
    explorerRequests.length === 1 && explorerRequests[0] === expectedFolder, 'Unexpected Explorer dispatch')
  assert.ok(check.folder === undefined ? explorerChecks.length === 0 :
    explorerChecks.length === 1 && explorerChecks[0] === expectedFolder, 'Unexpected Explorer verification')
  assert.equal(captures, 0)
  assert.equal(modelRequests, 0)
  const outcome = check.uri !== undefined ? `verified ms-settings:${check.uri}` : response
  console.log(`PASS live ${scenario} / ${outcome}`)
}

const liveCheck = liveCases.get(scenario)
if (live && (liveCheck?.uri !== undefined || liveCheck?.folder !== undefined)) {
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ general: { guidanceLevel: 'standard' } }))
  process.env.GEMINI_API_KEY = 'local-fixture-only'
}
if (mode === '--provider-live') {
  require('node:process').loadEnvFile(join(__dirname, '../../.env'))
  assert.ok(process.env.GEMINI_API_KEY, 'A Gemini key is required for the optional provider check')
}
require('../../out/main/index.js')
app.whenReady().then(async () => {
  tray('Open Assistant')
  const assistant = await findWindow('assistant')
  if (live && !agent) {
    await runLive(assistant)
    app.quit()
    return
  }
  const submit = (text, language) => run(assistant, `glintAPI.executeGoalStep(${JSON.stringify(language
    ? { source: 'voice', text, final: true, language }
    : { source: 'text', text })})`)
  if (nested) {
    await require('./nested-cases.cjs')({
      app, mode, scenario, profile, screen, knownFolders, submit, tray,
      assistant, run, findWindow, until, enterDraft,
      setKey: () => { process.env.GEMINI_API_KEY = 'local-fixture-only' },
      setPlan: handler => { modelReply = handler },
      setScript: handler => { scriptFixture = handler },
      checks: () => ({ requested, uiaChecks, explorerRequests, explorerChecks, revealed, captures, modelRequests }),
      reset: () => { requested = []; uiaChecks = []; explorerRequests = []; explorerChecks = []; revealed = []; settingsChecks = []; captures = 0 }
    })
    app.quit()
    return
  }
  if (agent) {
    await require('./automation-cases.cjs')({
      mode, profile, knownFolders, submit,
      setKey: () => { if (mode !== '--provider-live') process.env.GEMINI_API_KEY = 'local-fixture-only' },
      setPlan: handler => { modelReply = handler },
      setScript: handler => { scriptFixture = handler },
      failElectronLaunch: fail => { failLaunch = fail },
      setSettingsObservation: value => { settingsStatus = value },
      checks: () => ({ requested, explorerRequests, explorerChecks, revealed, settingsChecks, captures, modelRequests }),
      reset: () => { requested = []; explorerRequests = []; explorerChecks = []; revealed = []; settingsChecks = [] }
    })
    app.quit()
    return
  }
  let passed = 0
  async function test(name, verify) {
    requested = []
    explorerRequests = []
    explorerChecks = []
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
    ['Settings app context from a transcript', ([name]) => submit(`Hey Glint, could you pull up the ${name} settings page in Windows Settings for me, please?`, 'en')],
    ['Windows Settings before the destination', ([, alias]) => submit(`Open the Windows 11 Settings app to the ${alias} page.`)],
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
        assert.match(result.text, /is open in Windows Settings/)
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
        assert.match(result.error, /could not verify/)
        assert.deepEqual(requested, [`ms-settings:${uri}`])
      } finally {
        failLaunch = false
      }
      assert.equal((await submit(`Open ${name} settings.`)).success, true)
      assert.deepEqual(requested, [`ms-settings:${uri}`, `ms-settings:${uri}`])
    })
    await test(`${name} / repeated request`, async () => {
      const result = await submit(`${tamil} settings திற.`, 'ta')
      assert.match(result.text, /already verified/)
      assert.deepEqual(requested, [])
    })
  }

  for (const text of [
    "Don't open Wi-Fi settings.", 'Explain what Bluetooth is.', 'Can you show me how Wi-Fi works?',
    'Show me how to open Bluetooth settings.', 'Turn off Wi-Fi.', 'Pair my Bluetooth headphones.',
    'Open Wi-Fi settings and turn it off.',
    'Open the Wi-Fi settings page in Windows Settings and turn Wi-Fi off.',
    'Show me how to open the Display page in Windows Settings.',
    'Open Wi-Fi settings && ms-settings:windowsupdate', 'Open ms-settings:display',
    'Open Wi-Fi settings\nOpen Sound settings', 'Open https://example.invalid',
    'Open Advanced display settings and change the refresh rate.', 'வைஃபை அமைப்புகளைத் திறக்க வேண்டாம்.',
    'புளூடூத் அமைப்புகளைத் திறப்பது எப்படி என்று விளக்கவும்.'
  ]) {
    await test(`must not launch / ${text}`, async () => {
      assert.match((await submit(text)).error, /API key/)
      assert.deepEqual(requested, [])
    })
  }

  await test('generic and Tamil ambiguity', async () => {
    assert.match((await submit('Open Windows Settings.')).text, /Windows Settings is open/)
    assert.match((await submit('வைஃபை அல்லது புளூடூத் அமைப்புகள் திறக்கவும்.', 'ta')).text, /Which Windows Settings page/)
    assert.deepEqual(requested, ['ms-settings:'])
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
    const result = await submit('Show me the Sound settings page in Windows Settings.', 'en')
    assert.equal(result.success, true)
    assert.deepEqual(requested, ['ms-settings:sound'])
    tray('Settings')
    const settingsAgain = await findWindow('settings')
    await run(settingsAgain, `glintAPI.saveSettings({ai: {apiKey: ''}})`)
    settingsAgain.close()
    tray('Open Assistant')
  })
  await test('typed draft is editable and waits for Send', async () => {
    await until(() => run(assistant, '!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
    await enterDraft(assistant, 'Open Wi-Fi settings.')
    assert.deepEqual(requested, [])
    await enterDraft(assistant, 'Take me to Display settings.')
    await run(assistant, 'document.querySelector(".send-btn").click(); document.querySelector(".send-btn").click()')
    await until(() => run(assistant, 'document.querySelector(".response-text")?.textContent.includes("Display is open in Windows Settings")'), 'visible launch response')
    assert.deepEqual(requested, ['ms-settings:display'])
  })

  for (const [text, folder, language] of [
    ['Open File Explorer.', ''],
    ['Open my Downloads folder.', 'downloads'],
    ['Show me my Documents.', 'documents'],
    ['Open the Pictures folder.', 'pictures'],
    ['Where are my downloaded files?', 'downloads'],
    ['Open File Explorer to my Documents folder.', 'documents'],
    ['Show me the Pictures directory in File Explorer.', 'pictures'],
    ['Where can I find my Downloads folder in File Explorer?', 'downloads', 'en'],
    ['ஆவணங்கள் கோப்புறையை திறக்கவும்.', 'documents', 'ta'],
    ['Open the Pictures directory.', 'pictures', 'en'],
    ['Downloads folder எங்கே இருக்கு?', 'downloads'],
    ['என் ஆவணங்கள் கோப்புறையைத் திறக்கவும்.', 'documents'],
    ['படங்கள் கோப்புறையைத் திறக்கவும்.', 'pictures', 'ta'],
    ['Downloads folder எங்கே இருக்கு?', 'downloads', 'ta']
  ]) {
    await test(`Explorer / ${text} / ${language ?? 'typed'}`, async () => {
      const result = await submit(text, language)
      assert.equal(result.success, true, result.error)
      assert.match(result.text, /is open in File Explorer\.$/)
      assert.deepEqual(explorerRequests, [folder ? knownFolders[folder] : ''])
      assert.deepEqual(explorerChecks, explorerRequests)
      assert.deepEqual(requested, [])
    })
  }
  await test('Explorer / immediate repeat', async () => {
    assert.match((await submit('Open Downloads.')).text, /already verified/)
    assert.deepEqual(explorerRequests, [])
  })
  await test('Explorer / explicit launch error and retry', async () => {
    failLaunch = true
    try {
      const result = await submit('Open Documents.')
      assert.equal(result.success, false)
      assert.match(result.error, /Windows could not open Documents/)
    } finally {
      failLaunch = false
    }
    assert.match((await submit('Open Documents.')).text, /^Documents is open/)
    assert.deepEqual(explorerRequests, [knownFolders.documents, knownFolders.documents, knownFolders.documents])
    assert.deepEqual(explorerChecks, [knownFolders.documents])
  })
  await test('Explorer / unverified request', async () => {
    explorerStatus = 'requested'
    try {
      const result = await submit('Open Pictures.')
      assert.match(result.error, /could not verify Pictures/)
      assert.deepEqual(explorerRequests, [knownFolders.pictures, knownFolders.pictures])
    } finally {
      explorerStatus = 'verified'
    }
  })
  await test('Explorer / UNC, relative and drive root redirections are outside the demo scope', async () => {
    const local = knownFolders.downloads
    try {
      for (const path of ['\\\\server\\share', 'relative\\Downloads', 'D:\\']) {
        knownFolders.downloads = path
        assert.equal((await submit('Open Downloads.')).success, false)
      }
    } finally {
      knownFolders.downloads = local
    }
    assert.deepEqual(explorerRequests, [])
  })
  await test('Explorer / missing directory and file masquerading as a known folder', async () => {
    const local = knownFolders.downloads
    const invalidFile = join(profile, 'fixture.exe')
    writeFileSync(invalidFile, 'test fixture only')
    try {
      for (const path of [join(profile, 'absent directory'), invalidFile]) {
        knownFolders.downloads = path
        assert.match((await submit('Open Downloads.')).error, /could not open Downloads|folder for Downloads is unavailable/)
      }
    } finally {
      knownFolders.downloads = local
    }
    assert.deepEqual(explorerRequests, [])
    assert.deepEqual(explorerChecks, [])
  })
  await test('Explorer / ambiguous folder choice', async () => {
    assert.match((await submit('Open Downloads or my Documents.')).text, /Which folder should I open/)
    assert.deepEqual(explorerRequests, [])
  })
  for (const text of [
    'Show me the latest PDF in Downloads.', 'நான் download பண்ண file-ஐ காட்டு.',
    "Don't open Downloads.", 'Delete a file in Downloads.', 'Rename my Documents folder.',
    'Move Downloads to Pictures.', 'Overwrite a file.', 'Run the installer in Downloads.',
    'Open ../Documents.', 'Open C:\\Windows\\System32.', 'Open file:///C:/example/private.txt',
    'Open \\\\server\\share', 'Open Downloads & calc.exe', 'Open Wi-Fi settings; start calc.exe',
    'Open invoice.pdf', 'Open my .env file', 'Show me ~/.ssh', 'Open budget.json', 'Open the secrets directory'
  ]) {
    await test(`Explorer / keep local without launching / ${text}`, async () => {
      const result = await submit(text)
      assert.match(result.text || result.error, /No matching item|API key/)
      assert.deepEqual(explorerRequests, [])
      assert.deepEqual(requested, [])
    })
  }
  console.log(`PASS ${passed} navigation cases for Windows Settings (${pages.length} pages) and File Explorer (launch fixtures).`)
  app.quit()
}).catch(error => {
  console.error(error)
  app.exit(1)
})
