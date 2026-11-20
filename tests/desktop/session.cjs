// Real built app and OS integration. Substitute only the model transport and explicit fault cases.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const childProcess = require('node:child_process')
const { spawn } = childProcess
const { join } = require('node:path')
const { app, BrowserWindow, Tray, desktopCapturer, nativeImage, screen, Notification } = require('electron')
const [profile, phase] = process.argv.slice(2)
app.setPath('userData', profile)
app.commandLine.appendSwitch('force-renderer-accessibility')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, description, timeout = 12000) {
  const end = Date.now() + timeout
  do {
    const result = await check()
    if (result) return result
    await sleep(60)
  } while (Date.now() < end)
  throw new Error('Timed out waiting for ' + description)
}
const run = (win, js) => win.webContents.executeJavaScript(js)
const roleWindow = role => until(() => BrowserWindow.getAllWindows().find(w =>
  w.webContents.getURL().endsWith('?window=' + role) && !w.webContents.isLoading()), role)
const api = (win, method, ...args) => run(win, 'window.glintAPI[' + JSON.stringify(method) + '](...' + JSON.stringify(args) + ')')
const pass = label => console.log('PASS ' + phase + ' / ' + label)

let trayMenu
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (menu) {
  trayMenu = menu
  return setMenu.call(this, menu)
}
function tray(label) {
  const item = trayMenu.items.find(item => item.label.startsWith(label))
  assert.ok(item)
  item.click(item)
}

let mode = 'guide'
let requests = []
let pending = false
const ipcErrors = []
app.on('web-contents-created', (_, contents) => {
  contents.on('preload-error', (_, _path, error) => ipcErrors.push(error.message))
  contents.on('render-process-gone', (_, details) => ipcErrors.push(details.reason))
})
global.fetch = async (_url, options) => {
  const prompt = JSON.parse(options.body).contents[0].parts[0].text
  requests.push(prompt)
  if (mode === 'hold') {
    pending = true
    await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
  }
  if (mode === 'fail') return new Response('', { status: 403 })
  let answer = { nextStep: 'Read the fixture instruction.', targetLabel: '', goalCompleted: false }
  if (mode === 'visual') answer = { steps: [
    { instruction: 'Select the fixture button.', targetLabel: 'Glint audit target' },
    { instruction: 'Check the result.', targetLabel: 'Glint audit result' }
  ] }
  if (mode === 'finish') answer = { nextStep: '', targetLabel: '', previousStepCompleted: true, goalCompleted: true }
  if (mode === 'ambiguous') answer.nextStep = 'Which window do you mean?'
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }))
}

let handleAssisted = false
let fixtureBounds
const execFile = childProcess.execFile
childProcess.execFile = function (file, args, options, callback) {
  if (!args.some(arg => arg.endsWith('find-control.ps1'))) return execFile.apply(this, arguments)
  return execFile(file, args, options, (error, stdout, stderr) => {
    if (error || JSON.parse(stdout).found || !fs.existsSync(join(profile, 'fixture-handle'))) {
      callback(error, stdout, stderr)
      return
    }
    handleAssisted = true
    const fallback = [...args.slice(0, -1), join(__dirname, 'read-target.ps1')]
    execFile(file, fallback, { ...options, env: { ...options.env, GLINT_FIXTURE_PROFILE: profile } }, (err, data, errors) => {
      if (!err && JSON.parse(data).found) {
        const { rectangle, nativeRect } = JSON.parse(data)
        fixtureBounds = nativeRect
        assert.equal(rectangle.x, nativeRect.left)
        assert.equal(rectangle.y, nativeRect.top)
      }
      callback(err, data, errors)
    })
  })
}

require('../../out/main/index.js')
app.whenReady().then(async () => {
  assert.equal(BrowserWindow.getAllWindows().length, 0)
  tray('Open Assistant')
  const assistant = await roleWindow('assistant')
  await until(() => run(assistant, '!!document.querySelector("input")'), 'assistant input')
  assert.equal(await run(assistant, 'typeof window.electron'), 'undefined')
  tray('Settings')
  const settings = await roleWindow('settings')
  const settingsFile = join(profile, 'settings.json')
  if (phase === 'corrupt') {
    await until(() => run(settings, '!!document.querySelector("[role=alert]")'), 'load error')
    await assert.rejects(api(settings, 'saveSettings', { ai: { apiKey: '' } }))
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), '{broken fixture')
    pass('damaged profile preserved and error visible')
  } else if (phase === 'reminder') {
    let shown = false
    const show = Notification.prototype.show
    Notification.prototype.show = function () { shown = true; return show.call(this) }
    assert.equal((await api(assistant, 'executeGoalStep', 'Reminder fixture')).success, true)
    await until(() => shown, 'two-minute idle reminder', 130000)
    assert.equal((await api(assistant, 'getGoalSession')).state, 'Idle')
    await api(assistant, 'resumeGoal')
    assert.equal((await api(assistant, 'getGoalSession')).state, 'Active')
    await api(assistant, 'snoozeGoal')
    assert.equal((await api(assistant, 'getGoalSession')).state, 'Idle')
    await api(assistant, 'markGoalComplete')
    const history = await api(assistant, 'getGoalHistory')
    assert.equal(history.at(-1).state, 'Completed')
    assert.equal(history.at(-1).latestScreenshot, null)
    pass('two-minute inactivity, native notification request, resume, snooze and completion')
  } else if (phase !== 'fresh') {
    const view = await api(settings, 'getSettings')
    assert.equal(view.ai.hasApiKey, true)
    assert.equal(view.appearance.accentColor, '#10893e')
    assert.ok(!fs.readFileSync(settingsFile, 'utf8').includes('local-fixture-only'))
    const result = await api(assistant, 'executeGoalStep', 'Check the settings')
    assert.equal(result.success, true)
    pass('saved preference and encrypted credential usable after launch')
  } else {
    await until(() => run(settings, '!!document.querySelector("select")'), 'settings hydration')
    for (const tab of ['General', 'Appearance', 'Voice', 'Hotkeys', 'AI', 'About']) {
      await run(settings, 'Array.from(document.querySelectorAll("nav button")).find(b => b.innerText.trim() === ' + JSON.stringify(tab) + ').click()')
      if (tab === 'Appearance') await run(settings, `document.querySelector('[aria-label="Select green accent color"]').click()`)
      if (tab === 'Voice') assert.equal(await run(settings, 'document.querySelector("input").disabled'), true)
      if (tab === 'Hotkeys') assert.ok((await run(settings, 'document.body.innerText')).includes('Space'))
    }
    settings.minimize()
    tray('Settings')
    await until(() => !settings.isMinimized(), 'restored settings')
    assert.equal((await api(settings, 'getSettings')).appearance.accentColor, '#10893e')
    const noKey = await api(assistant, 'executeGoalStep', 'Open Task Manager.')
    assert.match(noKey.error, /API key/)
    assert.equal(requests.length, 0)
    await api(settings, 'saveSettings', { ai: { apiKey: 'local-fixture-only' } })
    await assert.rejects(api(settings, 'saveSettings', { ai: { model: '../invalid' } }))
    await assert.rejects(api(assistant, 'getSettings'))
    assert.equal((await api(settings, 'getSettings')).ai.apiKey, undefined)
    await api(settings, 'closeWindow')
    tray('Open Assistant')
    await api(assistant, 'closeWindow')
    await until(() => !assistant.isVisible(), 'hidden assistant')
    tray('Open Assistant')
    await until(() => assistant.isVisible(), 'restored assistant')
    pass('tray callbacks, window lifecycle, six settings tabs, key and role boundaries')

    tray('System Details')
    const details = await roleWindow('system-details')
    const info = await api(details, 'getSystemInfo')
    assert.equal(info.computerName, os.hostname())
    assert.equal(info.cpu, os.cpus()[0].model)
    assert.equal(info.appVersion, app.getVersion())
    const primary = screen.getPrimaryDisplay()
    assert.equal(info.displayScaling, Math.round(primary.scaleFactor * 100) + '%')
    assert.equal(info.ram, (os.totalmem() / 2 ** 30).toFixed(1) + ' GiB')
    await until(() => run(details, 'document.body.innerText.includes(' + JSON.stringify(info.computerName) + ')'), 'system values rendered')
    console.log('Display bounds', screen.getAllDisplays().map(d => ({bounds: d.bounds, scale: d.scaleFactor})))
    console.log('Display count ' + screen.getAllDisplays().length + ', scale ' + screen.getPrimaryDisplay().scaleFactor + ', GPU available ' + (info.gpu !== 'Unavailable'))
    await api(details, 'closeWindow')
    pass('native system information displayed')

    tray('Open Assistant')
    const sources = desktopCapturer.getSources.bind(desktopCapturer)
    let observed = false
    desktopCapturer.getSources = async options => {
      assert.equal(assistant.getOpacity(), 0)
      observed = true
      return sources(options)
    }
    const capture = await api(assistant, 'captureScreen')
    assert.equal(capture.displayId, String(screen.getPrimaryDisplay().id))
    assert.ok(observed && !nativeImage.createFromDataURL(capture.image).isEmpty())
    assert.equal(assistant.getOpacity(), 1)
    desktopCapturer.getSources = async () => []
    await assert.rejects(api(assistant, 'captureScreen'))
    assert.equal(assistant.getOpacity(), 1)
    desktopCapturer.getSources = sources
    pass('PNG decoded and original opacity restored on success and capture failure')

    const type = async text => {
      await run(assistant, 'document.querySelector("input").focus()')
      await assistant.webContents.insertText(text)
      await run(assistant, 'document.querySelector(".send-btn").click()')
    }
    await type('Open Task Manager.')
    await until(() => run(assistant, 'document.querySelector(".response-text")?.innerText.includes("fixture instruction")'), 'visible L1 response')
    const en = requests.at(-1)
    const goal = (text, source, language) => api(assistant, 'executeGoalStep',
      source === 'voice' ? { text, source, language, final: true } : { text, source })
    await goal('Open Task Manager.', 'voice', 'en-IN')
    assert.equal(requests.at(-1), en)
    const tamil = 'பணி மேலாளரைத் திறக்கவும்'
    await goal(tamil, 'text')
    const ta = requests.at(-1)
    assert.ok(ta.includes(tamil))
    await goal(tamil, 'voice', 'ta-IN')
    assert.equal(requests.at(-1), ta)
    for (const bad of ['', { source: 'voice', final: false, text: 'hello', language: 'en-IN' }, { source: 'action', text: 'open' }]) {
      const count = requests.length
      assert.equal((await api(assistant, 'executeGoalStep', bad)).success, false)
      assert.equal(requests.length, count)
    }
    mode = 'ambiguous'
    assert.match((await goal('Open it', 'text')).text, /Which window/)
    mode = 'fail'
    assert.equal((await goal('Show this window', 'text')).success, false)
    mode = 'hold'
    const delayed = goal('Wait', 'text')
    await until(() => pending, 'pending model call')
    await api(assistant, 'clearGoalSession')
    assert.equal((await delayed).success, false)
    assert.equal((await api(assistant, 'getGoalSession')).currentGoal, null)
    pass('rendered L1, identical English and Tamil prompts, ambiguity fixture, invalid inputs, denial and cancellation')

    await api(assistant, 'openSettings')
    const visualSettings = await roleWindow('settings')
    await api(visualSettings, 'saveSettings', { general: { guidanceLevel: 'standard' } })
    await api(visualSettings, 'closeWindow')
    mode = 'fail'
    const failedStart = await goal('Cannot start the plan', 'text')
    assert.equal(failedStart.success, false)
    assert.equal((await api(assistant, 'getGoalSession')).currentGoal, null)
    assert.ok(!BrowserWindow.getAllWindows().some(w => w.webContents.getURL().endsWith('window=floating-assistant')))
    pass('failed L2 initialization returns an error and closes the widget')
    const fixture = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(__dirname, 'target.ps1'), profile], { windowsHide: true, stdio: 'inherit' })
    app.on('will-quit', () => fixture.kill())
    process.on('exit', () => fixture.kill())
    await until(() => fs.existsSync(join(profile, 'fixture-ready')), 'Windows Forms target')
    mode = 'visual'
    const start = await goal('Show the test control', 'text')
    assert.equal(start.success, true, start.error)
    const widget = await roleWindow('floating-assistant')
    await until(() => run(widget, 'document.body.innerText.includes("Select the fixture button")'), 'first widget instruction')
    const overlay = await roleWindow('overlay')
    await until(() => run(overlay, 'document.body.innerText.includes("Glint audit target")'), 'native UIA highlight')
    assert.equal(overlay.isFocusable(), false)
    const original = widget.getBounds()
    widget.setPosition(original.x - 10, original.y - 10)
    assert.ok(Math.abs(widget.getBounds().x - (original.x - 10)) <= 1)
    desktopCapturer.getSources = async options => {
      assert.equal(widget.getOpacity(), 0)
      assert.equal(overlay.getOpacity(), 0)
      return sources(options)
    }
    assert.ok((await api(assistant, 'captureScreen')).image.startsWith('data:image/png'))
    desktopCapturer.getSources = sources
    assert.equal(overlay.getOpacity(), 1)
    await run(widget, 'document.querySelector(".glint-floating-close-btn").click()')
    await until(async () => (await api(assistant, 'getGoalSession')).state === 'Idle', 'pause')
    await api(assistant, 'resumeGoal')
    assert.ok(widget.isVisible())
    const other = screen.getAllDisplays().find(d => d.id !== screen.getPrimaryDisplay().id)
    const point = other && screen.dipToScreenPoint({ x: other.bounds.x + 80, y: other.bounds.y + 80 })
    fs.writeFileSync(join(profile, 'fixture-click'), JSON.stringify(point || null))
    await until(() => run(widget, 'document.body.innerText.includes("Check the result")'), 'UIA progression', 16000)
    await until(() => run(overlay, 'document.querySelector(".glint-target-text")?.innerText === "Glint audit result"'), 'second highlight')
    if (screen.getAllDisplays().length > 1) {
      const target = await run(overlay, 'document.querySelector(".glint-overlay-highlight").getBoundingClientRect().toJSON()')
      const bounds = overlay.getBounds()
      const center = { x: Math.round(bounds.x + target.x + target.width / 2), y: Math.round(bounds.y + target.y + target.height / 2) }
      assert.notEqual(screen.getDisplayNearestPoint(center).id, screen.getPrimaryDisplay().id)
      if (fixtureBounds) {
        await until(async () => {
          const r = await run(overlay, 'document.querySelector(".glint-overlay-highlight").getBoundingClientRect().toJSON()')
          const pixel = screen.dipToScreenPoint({ x: Math.round(bounds.x + r.x + r.width / 2), y: Math.round(bounds.y + r.y + r.height / 2) })
          return Math.abs(pixel.x - (fixtureBounds.left + fixtureBounds.right) / 2) <= 2 &&
            Math.abs(pixel.y - (fixtureBounds.top + fixtureBounds.bottom) / 2) <= 2
        }, 'overlay center within two physical pixels of native button')
      }
      pass('highlight center moved onto secondary display')
    }
    mode = 'finish'
    await run(widget, 'document.querySelector(".glint-floating-next-btn").click()')
    await until(() => widget.isDestroyed(), 'completion', 20000)
    console.log('UIA fixture lookup ' + (handleAssisted ? 'required known control handle' : 'used desktop root'))
    pass('real UIA and overlay, capture, widget movement, pause, resume, fixture interaction and completion')
    await api(assistant, 'openSettings')
    const finalSettings = await roleWindow('settings')
    await api(finalSettings, 'saveSettings', { general: { guidanceLevel: 'minimal' } })
  }
  assert.deepEqual(ipcErrors, [])
  tray('Exit')
}).catch(error => {
  console.error('FAIL ' + phase, error.message)
  app.exit(1)
})
