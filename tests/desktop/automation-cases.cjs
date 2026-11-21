const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { mkdirSync, readFileSync, utimesSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')
const runFile = promisify(execFile)

const call = (tool, args) => ({ tool, args })
const search = (terms, type, options = {}) => call('search', {
  terms, type, scopes: [], order: 'relevance', date: 'any', dateField: 'modified', ...options
})
const finish = { finish: 'done' }

module.exports = async function automation(test) {
  const { mode, profile, knownFolders, submit, setPlan, setKey, setScript, checks, reset } = test
  const mocked = mode === '--agent'
  const realProvider = mode === '--provider-live'
  const recordings = join(knownFolders.videos, 'Screen Recordings')
  const migration = join(knownFolders.documents, 'migration ledger')
  const north = join(knownFolders.documents, 'North', 'quarterly archive')
  const south = join(knownFolders.documents, 'South', 'quarterly archive')
  for (const folder of [recordings, migration, north, south]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(knownFolders.downloads, 'manual.pdf'), Buffer.alloc(400))
  writeFileSync(join(knownFolders.videos, 'short.mp4'), Buffer.alloc(2000))
  writeFileSync(join(recordings, 'long.mp4'), Buffer.alloc(80000))
  const revised = join(migration, 'resume.docx')
  writeFileSync(revised, 'Local regression fixture')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(13, 0, 0, 0)
  utimesSync(revised, yesterday, yesterday)
  writeFileSync(join(migration, 'resume-old.docx'), 'Local regression fixture')
  const beforeYesterday = new Date(yesterday.getTime() - 86400000 * 5)
  utimesSync(join(migration, 'resume-old.docx'), beforeYesterday, beforeYesterday)

  async function verify(label, fn) {
    reset()
    try {
      await fn()
      assert.equal(checks().captures, 0)
      console.log(`PASS ${mode} / ${label}`)
    } catch (error) {
      throw new Error(label, { cause: error })
    }
  }
  const route = (...steps) => setPlan(({ observations }) => {
    const next = steps[observations.length]
    assert.ok(next, 'The agent requested a turn after completing the fixture')
    return typeof next === 'function' ? next(observations.at(-1).result) : next
  })
  async function expect(text, expected, language) {
    const result = await submit(text, language)
    assert.equal(result.success, true, result.error)
    assert.match(result.text, expected)
  }

  if (realProvider) {
    await verify('Gemini interprets unseen English folder and Settings goals', async () => {
      await expect('Bring me to the folder where the migration ledger is kept.', /migration ledger is open in File Explorer/i)
      await expect('Take me to the setting where I can change which apps use my microphone.', /Microphone privacy is open/)
    })
    await verify('Gemini composes a Tamil metadata search and Explorer navigation', async () => {
      await expect('நேற்று திருத்திய resume ஆவணம் இருக்கும் கோப்புறையை காட்டுங்கள்.', /migration ledger is open in File Explorer/, 'ta')
    })
    assert.ok(checks().modelRequests > 0)
    return
  }

  await verify('known folders and offline discovery use the native Explorer outcome', async () => {
    await expect('Open my Downloads folder.', /Downloads is open|Redirected Downloads is open/)
    const count = checks().modelRequests
    const result = await submit('Open my screen recordings folder.')
    assert.equal(result.success, true, result.error)
    if (result.text.includes('Which result')) {
      const index = result.text.split('\n').find(line => /Screen Recordings/i.test(line))?.match(/^\d+/)?.[0]
      assert.ok(index)
      await expect(index, /Screen Recordings is open/)
    } else {
      assert.match(result.text, /Screen Recordings is open/)
    }
    assert.ok(checks().explorerChecks.includes(recordings))
    assert.equal(checks().modelRequests, count)
  })

  const pages = [
    ['Open Windows Settings.', '', /Windows Settings is open/],
    ['Open Wi-Fi settings.', 'network-wifi', /Wi-Fi is open/],
    ['Open Bluetooth settings.', 'bluetooth', /Bluetooth is open/],
    ['Open Display settings.', 'display', /Display is open/],
    ['Open Windows Update.', 'windowsupdate', /Windows Update is open/],
    ['Open microphone privacy settings.', 'privacy-microphone', /Microphone privacy is open/]
  ]
  for (const [goal, uri, response] of pages) {
    await verify(`Settings page ms-settings:${uri}`, async () => {
      await expect(goal, response)
      assert.deepEqual(checks().settingsChecks, [[`ms-settings:${uri}`, '0']])
    })
  }
  if (!mocked) {
    await verify('Settings reopens the requested page after a normal window close', async () => {
      const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      await runFile(powershell, ['-NoProfile', '-Sta', '-File', join(__dirname, 'close-settings.ps1')], {
        timeout: 10000, windowsHide: true
      })
      const { stdout: closed } = await runFile(powershell, ['-NoProfile', '-Sta', '-File',
        join(__dirname, '../../resources/verify-settings.ps1')], {
        timeout: 10000, windowsHide: true, encoding: 'utf8', env: {
          ...process.env, GLINT_SETTINGS_HOME: '1', GLINT_SETTINGS_HEADINGS: '[]', GLINT_SETTINGS_RETRY: '0'
        }
      })
      assert.match(closed, /no-window/)
      await expect('Open Windows Update.', /Windows Update is open/)
    })
  }
  await verify('Settings retries through native Shell after the Electron launcher fails', async () => {
    test.failElectronLaunch(true)
    if (mocked) test.setSettingsObservation('verified')
    try {
      const result = await submit('Open Display settings.')
      if (mocked) {
        assert.equal(result.success, false)
        assert.match(result.error, /could not verify/)
      } else {
        assert.equal(result.success, true, result.error)
        assert.match(result.text, /Display is open/)
      }
      assert.deepEqual(checks().settingsChecks, [['ms-settings:display', '1']])
    } finally { test.failElectronLaunch(false) }
  })
  if (mocked) {
    await verify('an unresponsive Settings window yields no success and permits another attempt', async () => {
      test.setSettingsObservation('unresponsive')
      const result = await submit('Open Sound settings.')
      assert.equal(result.success, false)
      assert.match(result.error, /unresponsive/)
      assert.deepEqual(checks().settingsChecks, [['ms-settings:sound', '0'], ['ms-settings:sound', '1']])
      test.setSettingsObservation('verified')
      await expect('Open Sound settings.', /Sound is open/)
    })
  }

  setKey()
  await verify('indirect Settings phrasing is resolved through the catalog', async () => {
    route(call('settings', { id: 'microphonePrivacy' }), finish)
    await expect('Take me to the setting where I can change my microphone permissions.', /Microphone privacy is open/)
    assert.deepEqual(checks().settingsChecks, [['ms-settings:privacy-microphone', '0']])
  })
  await verify('an unseen folder name composes discovery and verified Explorer navigation', async () => {
    route(search('migration ledger', 'folder'), observation => {
      assert.equal(observation.matches.length, 1)
      assert.ok(!JSON.stringify(observation).includes('migration ledger'))
      return call('explore', { id: observation.matches[0].id, mode: 'folder' })
    }, finish)
    await expect('Bring up wherever I keep the migration ledger.', /migration ledger is open/)
    assert.deepEqual(checks().explorerChecks, [migration])
  })
  await verify('Tamil voice transcript finds the document edited yesterday and opens its parent', async () => {
    route(search('resume', 'document', { date: 'yesterday', dateField: 'modified' }), observation => {
      assert.equal(observation.matches.length, 1)
      return call('explore', { id: observation.matches[0].id, mode: 'parent' })
    }, finish)
    await expect('நேற்று திருத்திய resume ஆவணம் இருக்கும் கோப்புறையை காட்டுங்கள்.', /migration ledger is open/, 'ta')
  })
  await verify('metadata sorting and file search report real sizes and filenames', async () => {
    route(search('', 'video', { order: 'size' }), observation => {
      assert.deepEqual(observation.matches.map(item => item.size), [80000, 2000])
      return call('show', { ids: observation.matches.map(item => item.id) })
    }, finish)
    await expect('What are my weightiest clips?', /long\.mp4[\s\S]*short\.mp4/)
    route(search('', 'pdf', { scopes: ['downloads'], order: 'created' }), observation =>
      call('show', { ids: [observation.matches[0].id] }), finish)
    await expect('Which PDF landed in Downloads most recently?', /manual\.pdf/)
  })
  await verify('revealing a file verifies the exact Explorer selection', async () => {
    route(search('manual', 'pdf', { scopes: ['downloads'] }), observation =>
      call('explore', { id: observation.matches[0].id, mode: 'reveal' }), finish)
    await expect('Select the manual PDF in File Explorer.', /manual\.pdf is selected/)
    assert.deepEqual(checks().explorerChecks, [knownFolders.downloads])
    assert.deepEqual(checks().revealed, [join(knownFolders.downloads, 'manual.pdf')])
  })
  await verify('duplicate results ask for a choice and use that verified selection', async () => {
    route(search('quarterly archive', 'folder'), observation => {
      assert.equal(observation.matches.length, 2)
      return call('explore', { id: observation.matches[0].id, mode: 'folder' })
    })
    const response = await submit('Find the quarterly archive and open it.')
    assert.match(response.text, /Which result/)
    const southOption = response.text.split('\n').find(line => line.includes('(South)')).match(/^\d+/)[0]
    await expect(southOption, /quarterly archive is open/)
    assert.deepEqual(checks().explorerChecks, [south])
  })
  await verify('invalid references, missing paths and disallowed locations are rejected and replanned', async () => {
    const missing = join(migration, 'no-such-folder')
    const outside = join(profile, 'outside-approved-roots')
    route(call('explore', { id: 'invented', mode: 'folder' }), observation => {
      assert.match(observation.error, /reference/)
      return call('locate', { path: missing })
    }, observation => {
      assert.match(observation.error, /does not exist/)
      return call('locate', { path: outside })
    }, observation => {
      assert.match(observation.error, /outside/)
      return search('absent folder', 'folder', { scopes: ['documents'] })
    }, observation => {
      assert.deepEqual(observation.matches, [])
      return { ask: 'Which folder name should I look for?' }
    })
    await expect(`Look for ${missing} or ${outside}.`, /Which folder name/)
    assert.deepEqual(checks().explorerChecks, [])
  })
  await verify('missing applications and UIA failures allow safe replanning', async () => {
    route(call('findWindow', { query: 'Glint no-such-window fixture' }), observation => {
      assert.match(observation.error, /No open|could not complete/)
      return call('findExplorerTabs', { query: 'Glint absent tab fixture' })
    }, observation => {
      assert.match(observation.error, /No visible|could not complete/)
      return call('settings', { id: 'display' })
    }, finish)
    await expect('Show me the missing fixture’s display configuration, using Windows Settings if needed.', /Display is open/)
    if (mocked) assert.deepEqual(checks().settingsChecks, [['ms-settings:display', '0']])
  })
  if (!mocked) {
    await verify('UI Automation observes and selects a real Explorer tab', async () => {
      const tabName = `tab fixture ${process.pid}`
      mkdirSync(join(knownFolders.documents, tabName))
      route(search(tabName, 'folder', { scopes: ['documents'] }), observation =>
        call('explore', { id: observation.matches[0].id, mode: 'folder' }), finish)
      await expect(`Open the ${tabName} folder.`, /tab fixture \d+ is open/)
      route(call('findExplorerTabs', { query: tabName }), observation => {
        assert.equal(observation.matches?.length, 1, observation.error)
        return call('selectExplorerTab', { id: observation.matches[0] })
      }, finish)
      await expect(`Switch to the ${tabName} tab in Explorer.`, /Selected the .*tab fixture \d+.* tab/)
    })
  } else {
    await verify('forged tools and success claims have no effect', async () => {
      route(call('runPowerShell', { command: 'fixture' }), finish, { stop: 'blocked' })
      assert.equal((await submit('Delete the local fixture')).success, false)
      assert.deepEqual(checks().requested, [])
      assert.deepEqual(checks().explorerRequests, [])
    })
    await verify('UI Automation discovery references are required for tab selection', async () => {
      setScript((file, env) => file.endsWith('explorer-tabs.ps1')
        ? (env.GLINT_TAB_ID === '11.2' ? 'verified' : '[{"id":"11.2","label":"Archive"}]') : undefined)
      route(call('findExplorerTabs', { query: 'Archive' }), observation =>
        call('selectExplorerTab', { id: observation.matches[0] }), finish)
      await expect('Go back to the Archive tab in Explorer.', /Selected the “Archive” tab/)
      setScript(undefined)
    })
  }
  const audit = readFileSync(join(profile, 'automation-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(audit.some(entry => entry.tool === 'explore' && entry.status === 'verified'))
  assert.ok(audit.some(entry => entry.status === 'rejected'))
  assert.ok(!JSON.stringify(audit).includes('migration ledger'))
}
