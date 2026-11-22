const assert = require('node:assert/strict')
const { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')
const exec = promisify(require('node:child_process').execFile)

const ask = 'How to enable dynamic refresh rate for my display?'
const call = (tool, args) => ({ tool, args })
const finish = { finish: 'done' }
const ref = { handle: '999', process: 101, executable: 'ApplicationFrameHost' }
function element(name, properties = {}) {
  return {
    name, type: 'Button', runtimeId: '1.2.3', process: 102, automationId: '',
    parents: [], heading: 'None', bounds: { x: 200, y: 180, width: 120, height: 45 },
    visible: true, enabled: true, patterns: [], state: {}, ...properties
  }
}
const heading = name => element(name, { heading: 'Level1', runtimeId: '1.2.4' })
const dynamic = state => element('Dynamic refresh rate', {
  automationId: 'SystemSettings_Display_AdvancedDisplaySettingsDynamicRefreshRate_ToggleSwitch',
  runtimeId: '1.2.5', state: { toggle: state }, patterns: ['Toggle']
})
const observed = (...items) => ({ status: 'observed', window: ref, items })

module.exports = async function nested(test) {
  const { mode, scenario, profile, checks, reset, setScript, setPlan, setKey, submit } = test
  const auditPath = join(profile, 'automation-audit.jsonl')
  const audit = () => existsSync(auditPath) ? readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse) : []
  const failures = []
  const desktopFixture = async (mode, folder, name, processName) => {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Sta', '-File',
      join(__dirname, 'nested-fixture.ps1'), mode], {
      windowsHide: true, timeout: 10000, env: { ...process.env, GLINT_FIXTURE_FOLDER: folder,
        GLINT_FIXTURE_NAME: name, GLINT_FIXTURE_PROCESS: processName }
    })
    return stdout.trim()
  }
  async function verify(name, operation) {
    if (scenario && !scenario.split(',').includes(name)) return
    reset()
    try {
      const detail = await operation()
      assert.equal(checks().captures, 0)
      console.log('PASS ' + name + (detail ? ' / ' + detail : ''))
    } catch (error) {
      console.error('FAIL ' + name, error.message)
      failures.push(name)
      const entries = audit()
      const last = entries.at(-1)
      if (last) console.error(entries.filter(entry => entry.run === last.run).map(({ tool, status, target, result }) =>
        [tool, status, target, result].filter(Boolean).join(' | ')).join('\n'))
    }
  }
  function route(...steps) {
    setPlan(({ observations }) => {
      const next = steps[observations.length]
      assert.ok(next, 'Unexpected planner decision')
      return typeof next === 'function' ? next(observations.at(-1).result) : next
    })
  }

  if (mode === '--nested-fixture') {
    let advanced
    let invocations
    let mode
    let stale
    let clicked
    let mutations
    let currentState
    let expanded
    function setup(nextMode) {
      mode = nextMode
      advanced = false
      stale = true
      invocations = 0
      clicked = 0
      mutations = 0
      currentState = 'Off'
      expanded = false
      setScript((file, vars) => {
        if (!file.endsWith('windows-uia.ps1')) return
        const { operation, query, element: id, action } = JSON.parse(vars.GLINT_UIA_REQUEST)
        let result
        if (operation === 'navigate' && ['expand', 'collapse'].includes(action)) {
          expanded = action === 'expand'
          result = { status: 'dispatched', window: ref }
        } else if (operation === 'navigate') {
          invocations++
          if (mode === 'retry' && stale) { stale = false; result = { status: 'stale' } }
          else {
            clicked++
            advanced = mode !== 'bad-transition'
            result = { status: 'dispatched', window: ref }
          }
        } else if (operation === 'toggle') {
          mutations++
          currentState = 'On'
          result = { status: 'dispatched', window: ref }
        } else if (operation === 'bounds') {
          result = observed(id)
        } else if (query.ancestor === 'Related settings') {
          const link = element('Advanced display')
          result = mode === 'ambiguous' ? observed(link, { ...link, runtimeId: '2.3' }) : observed(link)
        } else if (query.names?.includes('Display')) {
          result = advanced ? observed() : observed(heading('Display'))
        } else if (query.names?.includes('Advanced display')) {
          result = advanced ? observed(heading('Advanced display')) : observed()
        } else if (query.automationId?.endsWith('ToggleSwitch')) {
          result = mode === 'legacy' ? observed() : observed({ ...dynamic(currentState), enabled: mode !== 'unsupported' })
        } else if (query.automationId?.endsWith('RefreshRate_ComboBox')) {
          result = observed(element('Refresh rate', { type: 'ComboBox', state: { expanded: expanded ? 'Expanded' : 'Collapsed' },
            patterns: ['ExpandCollapse'] }))
        } else if (query.ancestor === 'Refresh rate') {
          result = observed(element('120.00 Hz', { type: 'ListItem' }))
        } else if (query.types?.includes('Group')) {
          result = observed(element('fixture display', { type: 'Group' }))
        } else if (query.names?.includes('Variable refresh rate')) {
          result = observed(element('Variable refresh rate', { parents: [{ name: 'fixture display', type: 'Group', automationId: '' }] }))
        } else {
          result = observed()
        }
        return JSON.stringify(result)
      })
    }

    await verify('stale element recovery and exact request', async () => {
      setup('retry')
      assert.match((await submit(ask)).text, /highlighted and is off/)
      assert.deepEqual(checks().requested, ['ms-settings:', 'ms-settings:display'])
      assert.equal(invocations, 2)
      assert.equal(clicked, 1)
      assert.equal(mutations, 0)
      assert.equal(checks().modelRequests, 0)
      assert.ok(audit().some(item => item.tool === 'uia.navigate' && item.result === 'invoke:stale'))
    })
    await verify('ambiguous match and unverified destination', async () => {
      setup('ambiguous')
      assert.match((await submit(ask)).error, /ambiguous/)
      assert.equal(invocations, 0)
      setup('bad-transition')
      assert.match((await submit(ask)).error, /Advanced display.*missing/)
      assert.equal(clicked, 1)
      assert.equal(mutations, 0)
    })
    await verify('disabled hardware control', async () => {
      setup('unsupported')
      assert.match((await submit(ask)).text, /disabled it/)
      assert.equal(mutations, 0)
    })
    await verify('legacy static-only refresh list', async () => {
      setup('legacy')
      assert.match((await submit(ask)).text, /refresh-rate list has no Dynamic option/)
      assert.equal(expanded, false)
      assert.equal(mutations, 0)
    })
    await verify('explicit confirmation is single-use and verified', async () => {
      setup('confirmation')
      assert.match((await submit('Enable Dynamic Refresh Rate.')).text, /Reply.*Confirm Dynamic Refresh Rate/)
      assert.equal(mutations, 0)
      // Settings returns to Display when its native route is invoked again.
      advanced = false
      assert.match((await submit('Confirm Dynamic Refresh Rate')).text, /verified.*now on/)
      assert.equal(mutations, 1)
      assert.match((await submit('Confirm Dynamic Refresh Rate')).error, /no pending/)
      assert.equal(mutations, 1)
    })
    await verify('invalidated confirmation and cancellation', async () => {
      setup('confirmation')
      assert.match((await submit('Enable Dynamic Refresh Rate.')).text, /Confirm/)
      await test.run(test.assistant, 'glintAPI.clearGoalSession()')
      assert.match((await submit('Confirm Dynamic Refresh Rate')).error, /no pending/)
      let started
      const active = new Promise(resolve => { started = resolve })
      let release
      const hold = new Promise(resolve => { release = resolve })
      setScript(async file => {
        if (!file.endsWith('windows-uia.ps1')) return
        started()
        await hold
        return JSON.stringify(observed(heading('Display')))
      })
      const request = submit(ask)
      await active
      await test.run(test.assistant, 'glintAPI.clearGoalSession()')
      release()
      assert.match((await request).error, /cancelled/)
      assert.equal(mutations, 0)
    })
    await verify('planner rejects invented references and early completion', async () => {
      setKey()
      setup('planner')
      route(call('settings', { id: 'display' }), call('inspectUi', { scope: 'settings' }),
        call('highlightUi', { id: 'ui-invented' }), finish, ({}) => ({ stop: 'blocked' }))
      assert.equal((await submit('Locate the Slew control in Settings.')).success, false)
      assert.ok(audit().some(item => item.tool === 'finish' && item.status === 'rejected'))
    })
  } else {
    const launchCount = checks().modelRequests
    const drrResponse = /Dynamic refresh rate (?:is highlighted|but has disabled|option is highlighted)|Windows exposes Dynamic refresh rate but has disabled|refresh-rate list has no Dynamic|did not expose a (?:switch|Dynamic refresh rate switch)/i
    const goals = [
      ['drr', ask, drrResponse, 'Dynamic refresh rate|Dynamic refresh rate option|Refresh rate'],
      ['resolution', 'Where can I find screen resolution?', /Display resolution is highlighted/, 'Display resolution'],
      ['advanced-display', 'Show me the advanced screen details.', /Display information is highlighted/, 'Display information'],
      ['microphone', 'மைக்ரோஃபோன் அனுமதிகள் காட்டு.', /Microphone access is highlighted/, 'Microphone access', 'ta'],
      ['audio-output', 'Find my default audio output device.', /Default audio output is highlighted/, 'Default audio output'],
      ['proxy', 'Take me to Proxy settings.', /Proxy settings is highlighted/, 'Proxy settings'],
      ['vpn', 'Where are VPN connections?', /VPN settings is highlighted/, 'VPN settings'],
      ['startup', 'Find apps that start automatically.', /Startup apps is highlighted/, 'Startup apps'],
      ['update-history', 'விண்டோஸ் புதுப்பிப்பு வரலாறு எங்கே?', /Update history is highlighted/, 'Update history', 'ta'],
      ['mouse', 'Open advanced mouse settings.', /Mouse Properties is open and highlighted/, 'Mouse Properties']
    ]
    for (const [name, goal, response, label, language] of goals) {
      await verify(name, async () => {
        const offset = audit().length
        let result
        if (name === 'drr') {
          await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Sta', '-File', join(__dirname, 'close-settings.ps1'), '-AllowClosed'],
            { windowsHide: true, timeout: 10000 })
          test.tray('Open Assistant')
          await test.until(() => test.run(test.assistant, '!!document.querySelector(".assistant-content.fade-in")'), 'assistant startup')
          await test.enterDraft(test.assistant, goal)
          assert.equal(await test.run(test.assistant, 'document.querySelector("input").value'), ask)
          await test.run(test.assistant, 'document.querySelector(".send-btn").click()')
          const text = await test.until(() => test.run(test.assistant,
            'document.querySelector(".response-text, .analysis-error")?.textContent'), 'visible Glint response', 65000)
          result = { text }
        } else {
          result = await submit(goal, language)
          assert.equal(result.success, true, result.error)
        }
        assert.match(result.text, response)
        const { uiaChecks, requested } = checks()
        const overlay = await test.findWindow('overlay')
        await test.until(() => test.run(overlay, `new RegExp('^(?:${label})$', 'i').test(document.querySelector(".glint-target-text")?.textContent)`), 'overlay label')
        assert.equal(overlay.isFocusable(), false)
        const uiBounds = uiaChecks.findLast(entry => entry.request.operation === 'bounds' && entry.reply.status === 'observed')
        assert.ok(uiBounds?.reply.items[0].bounds)
        const osBounds = uiBounds.reply.items[0].bounds
        const rendered = await test.run(overlay, 'document.querySelector(".glint-overlay-highlight").getBoundingClientRect().toJSON()')
        const display = overlay.getBounds()
        const center = test.screen.dipToScreenPoint({ x: Math.round(display.x + rendered.x + rendered.width / 2),
          y: Math.round(display.y + rendered.y + rendered.height / 2) })
        assert.ok(Math.abs(center.x - (osBounds.x + osBounds.width / 2)) <= 3 &&
          Math.abs(center.y - (osBounds.y + osBounds.height / 2)) <= 3, 'overlay center is not on the verified UIA target')
        assert.equal(uiaChecks.filter(entry => entry.request.operation === 'toggle').length, 0)
        const trace = audit().slice(offset)
        const verified = trace.filter(entry => entry.status === 'verified').map(entry => entry.target)
        if (name === 'drr') {
          assert.deepEqual(requested, ['ms-settings:', 'ms-settings:display'])
          assert.ok(verified.indexOf('home') < verified.indexOf('display'))
          assert.ok(verified.indexOf('display') < verified.indexOf('Advanced display'))
          assert.ok(verified.indexOf('Advanced display') < verified.indexOf(uiBounds.reply.items[0].name))
          const toggle = uiaChecks.filter(entry => entry.request.query.automationId?.endsWith('DynamicRefreshRate_ToggleSwitch') &&
            entry.reply.status === 'observed').flatMap(entry => entry.reply.items)
          if (toggle.length) {
            assert.ok(toggle.every(item => item.state.toggle === toggle[0].state.toggle))
            return `Advanced display verified, switch enabled=${toggle[0].enabled}, state=${toggle[0].state.toggle}; overlay verified`
          }
        }
        assert.ok(trace.some(entry => entry.tool === 'uia.highlight' && entry.status === 'verified'))
        return verified.filter(value => value && value !== 'source page').filter((value, index, values) => values.indexOf(value) === index).join(' → ')
      })
    }
    assert.equal(checks().modelRequests, launchCount)
    if (!scenario || scenario.split(',').includes('mouse')) {
      await desktopFixture('close', '', 'Mouse Properties', 'rundll32')
    }

    const nestedFolder = join(test.knownFolders.documents, 'glint nested', 'glint archive')
    mkdirSync(nestedFolder, { recursive: true })
    const tabName = 'glint tabs ' + process.pid
    const tabFolder = join(test.knownFolders.documents, tabName)
    mkdirSync(tabFolder)
    const pdf = join(test.knownFolders.downloads, 'glint manual.pdf')
    writeFileSync(pdf, '%PDF-1.7\n')
    const recent = join(nestedFolder, 'glint review.docx')
    writeFileSync(recent, 'fixture document')
    const older = join(nestedFolder, 'glint review old.docx')
    writeFileSync(older, 'older fixture document')
    const old = new Date(Date.now() - 7 * 86400000)
    utimesSync(older, old, old)
    const search = (terms, type, scopes, order = 'relevance') =>
      call('search', { terms, type, scopes, order, date: 'any', dateField: 'modified' })
    const first = (tool, mode) => result => call(tool, { id: result.matches[0].id, ...(mode ? { mode } : {}) })
    const expect = async (goal, pattern, language) => {
      const result = await submit(goal, language)
      assert.equal(result.success, true, result.error)
      assert.match(result.text, pattern)
    }
    setKey()
    await verify('planner-ui', async () => {
      let controlId
      route(call('settings', { id: 'display' }), call('inspectUi', { scope: 'settings' }),
        call('findUi', { name: 'Display orientation', type: 'ComboBox', ancestor: '' }), result => {
          assert.equal(result.matches?.length, 1, result.error)
          controlId = result.matches[0].id
          return call('readUi', { id: controlId })
        }, result => {
          assert.equal(result.type, 'ComboBox')
          return call('revealUi', { id: controlId })
        }, result => {
          assert.equal(result.visible, true)
          return call('highlightUi', { id: controlId })
        }, finish)
      await expect('Locate the Display orientation control in Windows Settings.', /Highlighted “Display orientation”/)
      const overlay = await test.findWindow('overlay')
      await test.until(() => test.run(overlay,
        'document.querySelector(".glint-target-text")?.textContent === "Display orientation"'), 'planner-driven overlay')
    })
    await verify('downloads', async () => {
      await expect('Downloads folder எங்கே இருக்கு?', /Downloads is open/, 'ta')
      assert.deepEqual(checks().explorerChecks, [test.knownFolders.downloads])
    })
    await verify('nested-folder', async () => {
      route(search('glint archive', 'folder', ['documents']), first('explore', 'folder'), finish)
      await expect('Go into the glint archive folder.', /glint archive is open/)
      assert.deepEqual(checks().explorerChecks, [nestedFolder])
    })
    await verify('find-pdf', async () => {
      route(search('glint manual', 'pdf', ['downloads']), result => call('show', { ids: [result.matches[0].id] }), finish)
      await expect('Find the glint manual PDF in Downloads.', /glint manual\.pdf/)
    })
    await verify('select-file', async () => {
      route(search('glint manual', 'pdf', ['downloads']), first('explore', 'reveal'), finish)
      await expect('Select glint manual.pdf in File Explorer.', /glint manual\.pdf is selected/)
      assert.deepEqual(checks().revealed, [pdf])
    })
    await verify('file-properties', async () => {
      route(search('glint manual', 'pdf', ['downloads']), first('fileProperties'), finish)
      const before = readFileSync(pdf)
      try {
        await expect('Open Properties for glint manual.pdf.', /Opened Properties for/)
        assert.deepEqual(readFileSync(pdf), before)
      } finally {
        await desktopFixture('close', '', 'glint manual.pdf Properties', 'explorer')
      }
    })
    await verify('explorer-tab', async () => {
      route(search(tabName, 'folder', ['documents']), first('explore', 'folder'), finish)
      await expect(`Open the ${tabName} folder.`, /glint tabs \d+ is open/)
      assert.equal(await desktopFixture('add-tab', tabFolder, tabName, ''), 'verified')
      route(call('findExplorerTabs', { query: tabName }), result => {
        assert.equal(result.matches?.length, 1, result.error)
        return call('selectExplorerTab', { id: result.matches[0] })
      }, finish)
      await expect(`Switch to the ${tabName} tab in Explorer.`, /Selected the .*glint tabs \d+.* tab/)
      assert.equal(await desktopFixture('selected-tab', tabFolder, tabName, ''), 'verified')
    })
    await verify('recent-document', async () => {
      route(search('glint review', 'document', ['documents'], 'modified'), result => call('show', { ids: [result.matches[0].id] }), finish)
      await expect('சமீபத்தில் திருத்திய glint review ஆவணத்தை காட்டு.', /glint review\.docx/, 'ta')
    })
  }
  assert.deepEqual(failures, [])
}
