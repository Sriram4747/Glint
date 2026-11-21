// Run with Node and supply a short PCM WAV sample in the selected language.
// Chromium uses the file as its microphone unless --physical plays it through the speakers.
// --navigation exercises a real Windows launch from the reviewed transcript.
// --explorer expects a Downloads command in English or a Pictures command in Tamil.
const assert = require('node:assert/strict')
const { mkdtempSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { execFile, spawnSync } = require('node:child_process')

if (!process.versions.electron) {
  const [language, file, ...flags] = process.argv.slice(2)
  assert.ok(['en', 'ta'].includes(language) && file && existsSync(file),
    'Usage: node tests/desktop/voice.cjs en|ta <PCM WAV file> [--physical] [--navigation|--explorer [--review]]')
  const profile = mkdtempSync(join(tmpdir(), 'glint-voice-test-'))
  const env = { ...process.env }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GEMINI_API_KEY']) delete env[key]
  const test = spawnSync(require('electron'), [__filename, profile, language, resolve(file), ...flags], {
    cwd: profile, env, timeout: 120000, stdio: 'inherit', windowsHide: true
  })
  if (test.error) throw test.error
  process.exit(test.status ?? 1)
}

const { app, BrowserWindow, Tray, desktopCapturer, nativeImage, screen, shell } = require('electron')
const [profile, language, file, ...flags] = process.argv.slice(2)
const physical = flags.includes('--physical')
const explorer = flags.includes('--explorer')
const navigation = explorer || flags.includes('--navigation')
const audioSource = physical ? 'physical microphone via speaker playback' : 'file-backed microphone'
app.setPath('userData', profile)
app.disableHardwareAcceleration()
if (!physical) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${file}%noloop`)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const result = await check()
    if (result) return result
    await wait(50)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

let menu
const setContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (nextMenu) {
  menu = nextMenu
  return setContextMenu.call(this, nextMenu)
}
function tray(label) {
  const item = menu.items.find(item => item.label.startsWith(label))
  assert.ok(item)
  item.click(item)
}
const findWindow = role => until(() => BrowserWindow.getAllWindows().find(win =>
  win.webContents.getURL().endsWith(`?window=${role}`) && !win.webContents.isLoading()), role)

// Send neither private screenshots nor real credentials to Gemini during this test.
const requests = []
const launches = []
if (explorer) {
  const openPath = shell.openPath.bind(shell)
  shell.openPath = async folder => {
    launches.push('File Explorer')
    return openPath(folder)
  }
}
if (navigation) {
  const openExternal = shell.openExternal.bind(shell)
  shell.openExternal = async uri => {
    launches.push(uri)
    await openExternal(uri)
  }
}
let rejectModel = false
global.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body).contents[0].parts[0].text)
  if (rejectModel) return new Response('', { status: 403 })
  const answer = {
    nextStep: 'Open Bluetooth & devices in Windows Settings.', targetLabel: 'Bluetooth & devices', goalCompleted: false
  }
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })
}
desktopCapturer.getSources = async () => [{
  display_id: String(screen.getPrimaryDisplay().id),
  thumbnail: nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 255), { width: 16, height: 16 })
}]

require('../../out/main/index.js')
app.whenReady().then(async () => {
  tray('Settings')
  const settings = await findWindow('settings')
  await assert.rejects(settings.webContents.executeJavaScript('glintAPI.prepareVoice(1)'))
  if (!navigation) {
    await settings.webContents.executeJavaScript(`glintAPI.saveSettings({ai: {apiKey: 'local-fixture-only'}, general: {guidanceLevel: 'minimal'}})`)
  }
  settings.close()

  tray('Open Assistant')
  const assistant = await findWindow('assistant')
  const run = js => assistant.webContents.executeJavaScript(js)
  const status = () => run('document.querySelector(".assistant-voice-status").textContent')
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`)
  await until(() => run('!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
  assert.equal(await run(`navigator.mediaDevices.getUserMedia({audio: true}).then(
    stream => { stream.getTracks().forEach(track => track.stop()); return 'granted' }, error => error.name)`), 'NotAllowedError')
  await run(`{
    const media = navigator.mediaDevices;
    const getUserMedia = media.getUserMedia.bind(media);
    media.getUserMedia = async options => {
      const stream = await getUserMedia(options);
      window.voiceTestStream = stream;
      return stream;
    };
    void 0;
  }`)
  await run(`{
    const select = document.querySelector('[aria-label="Voice language"]');
    select.value = ${JSON.stringify(language)};
    select.dispatchEvent(new Event('change', {bubbles: true}));
  }`)

  async function start() {
    await click('.voice-btn')
    await until(async () => {
      const message = await status()
      if (message.startsWith('Listening')) return true
      if (await run('!!document.querySelector(".voice-error")')) throw new Error(message)
      return false
    }, 'listening')
  }
  const stopped = () => run(`voiceTestStream.getTracks().every(track => track.readyState === 'ended')`)
  await start()
  await click('.assistant-voice-cancel')
  assert.ok(await stopped())
  assert.equal(await status(), 'Recording cancelled.')
  assert.equal(requests.length, 0)
  assert.deepEqual(launches, [])

  await start()
  if (physical) {
    await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '[System.Media.SoundPlayer]::new($env:GLINT_TEST_WAV).PlaySync()'], {
        env: { ...process.env, GLINT_TEST_WAV: file }, windowsHide: true, timeout: 20000
      }, error => error ? reject(error) : resolve())
    })
    await wait(500)
  } else {
    await wait(4500)
  }
  await click('.voice-btn')
  assert.ok(await stopped())
  await until(async () => {
    const message = await status()
    if (await run('!!document.querySelector(".voice-error")')) throw new Error(message)
    return message.startsWith('Review and edit')
  }, 'final transcript', 65000)
  const transcript = await run('document.querySelector("input").value')
  assert.match(transcript, language === 'en' ? (explorer ? /downloads/i : /bluetooth/i) : /[\u0b80-\u0bff]/u)
  assert.equal(requests.length, 0)
  assert.deepEqual(launches, [])
  assert.ok(await run('!!document.querySelector(".send-btn:not(:disabled)")'))

  if (explorer) {
    const target = language === 'en' ? 'Downloads' : 'Pictures'
    if (flags.includes('--review')) {
      await run('document.querySelector("input").select()')
      await assistant.webContents.insertText(language === 'en' ? 'Open my Downloads folder.' : 'படங்கள் கோப்புறையைத் திறக்கவும்.')
    }
    const submitted = await run('document.querySelector("input").value')
    await run('document.querySelector(".send-btn").click(); document.querySelector(".send-btn").click()')
    await until(() => run(`document.querySelector('.response-text')?.textContent.includes('${target} is open in File Explorer')`),
      `verified Explorer location after submitting ${JSON.stringify(submitted)}`)
    assert.deepEqual(launches, ['File Explorer'])
    assert.equal(requests.length, 0)
    console.log(`PASS ${language} ${audioSource} / verified ${target} in File Explorer`)
    console.log(`Recognized: ${transcript} | Submitted: ${submitted}`)
    console.log('PASS cancellation, track cleanup, no launch before Send, one verified launch, zero Gemini calls')
    app.quit()
    return
  }

  if (navigation) {
    const english = language === 'en'
    const target = english ? 'Bluetooth' : 'Sound'
    const uri = english ? 'ms-settings:bluetooth' : 'ms-settings:sound'
    // The available Tamil sample tests recording in Tamil and the editable draft.
    if (!english) {
      await run('document.querySelector("input").select()')
      await assistant.webContents.insertText('ஒலி அமைப்புகளைத் திறக்கவும்.')
    }
    const submitted = await run('document.querySelector("input").value')
    await run('document.querySelector(".send-btn").click(); document.querySelector(".send-btn").click()')
    await until(() => run(`document.querySelector('.response-text')?.textContent.includes('Asked Windows to open ${target}')`),
      `launch response for ${target}`)
    assert.deepEqual(launches, [uri])
    assert.equal(requests.length, 0)
    console.log(`PASS ${language} ${audioSource} / native launch ${uri}`)
    console.log(`Recognized: ${transcript} | Submitted: ${submitted}`)
    console.log('PASS cancellation, track cleanup, no launch before Send, one OS request, zero Gemini calls')
    app.quit()
    return
  }

  await run('document.querySelector("input").select()')
  const goal = language === 'en' ? 'Show me how to open Bluetooth settings.' : 'புளூடூத் அமைப்புகளைத் திறப்பது எப்படி என்று விளக்கவும்.'
  await assistant.webContents.insertText(goal)
  rejectModel = true
  await run('document.querySelector(".send-btn").click(); document.querySelector(".send-btn").click()')
  await until(() => run('!!document.querySelector(".analysis-error")'), 'Gemini rejection')
  assert.equal(requests.length, 1)
  assert.equal(await run('document.querySelector("input").value'), goal)
  rejectModel = false
  await click('.send-btn')
  await until(() => run('document.querySelector(".response-text")?.textContent.includes("Bluetooth & devices")'), 'L1 instruction')
  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.ok(requests[1].includes(goal))
  const typed = await run(`glintAPI.executeGoalStep({ source: 'text', text: ${JSON.stringify(goal)} })`)
  assert.equal(typed.success, true)
  assert.equal(requests[1], requests[2])
  console.log(`PASS ${language} ${audioSource} / ${transcript}`)
  console.log('PASS permission scope, cancellation, track cleanup, editable review, single submission, Gemini error and L1 text parity')
  app.quit()
}).catch(error => {
  console.error(error.stack)
  app.exit(1)
})
