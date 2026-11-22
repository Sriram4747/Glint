const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

if (process.versions.electron) {
  const { app } = require('electron')
  const directory = process.argv[2]
  const profile = join(directory, 'profile')
  app.setPath('userData', profile)
  app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', async () => {
      try {
        const { appBuild } = await window.webContents.executeJavaScript('glintAPI.getSystemInfo()')
        appendFileSync(join(directory, 'observed.jsonl'), JSON.stringify({ pid: process.pid, appBuild }) + '\n')
      } catch (error) {
        console.error(error)
        app.exit(1)
      }
    })
  })
  const shutdown = setInterval(() => {
    if (existsSync(join(directory, 'quit'))) app.quit()
  }, 200)
  shutdown.unref()
  try {
    require(join(directory, 'out/main/index.js'))
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
} else {
  const electron = require('electron')
  const repo = resolve(__dirname, '../..')
  const directory = mkdtempSync(join(tmpdir(), 'glint-build-reload-'))
  const out = join(directory, 'out')
  const main = join(out, 'main/index.js')
  const observed = join(directory, 'observed.jsonl')
  const env = { ...process.env }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GEMINI_API_KEY']) delete env[key]
  const profile = join(directory, 'profile')
  mkdirSync(profile)
  mkdirSync(join(directory, 'resources'))
  copyFileSync(join(repo, 'resources/icon.png'), join(directory, 'resources/icon.png'))
  const toolkit = join('node_modules', '@electron-toolkit', 'utils')
  cpSync(join(repo, toolkit), join(directory, toolkit), { recursive: true })
  cpSync(join(repo, 'out'), out, { recursive: true })

  function expectedBuild() {
    const hash = createHash('sha256')
    for (const file of [main, join(out, 'preload/index.js'), join(out, 'renderer/index.html')]) {
      hash.update(readFileSync(file)).update('\0')
    }
    return hash.digest('hex').slice(0, 12)
  }

  async function waitForBuild(build) {
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      if (existsSync(observed)) {
        const entries = readFileSync(observed, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
        const instance = entries.find(entry => entry.appBuild === build)
        if (instance) return instance
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`No assistant reported build ${build}`)
  }

  const args = [__filename, directory, '--glint-show-assistant']
  function launchSecondInstance() {
    const child = spawnSync(electron, args, { cwd: profile, env, timeout: 12000, windowsHide: true, stdio: 'inherit' })
    if (child.error) throw child.error
    assert.equal(child.status, 0, 'The second process should hand off to the running instance')
  }

  async function verify() {
    const original = expectedBuild()
    const firstProcess = spawn(electron, args, { cwd: profile, env, windowsHide: true, stdio: 'inherit' })
    try {
      const first = await waitForBuild(original)
      assert.equal(first.pid, firstProcess.pid)
      launchSecondInstance()
      assert.doesNotThrow(() => process.kill(first.pid, 0), 'An identical build should reuse the running instance')
      appendFileSync(main, '\n// Simulated rebuilt bundle for this isolated profile.\n')
      const rebuilt = expectedBuild()
      assert.notEqual(rebuilt, original)
      launchSecondInstance()
      const replacement = await waitForBuild(rebuilt)
      assert.notEqual(replacement.pid, first.pid)
      console.log(`PASS same build reused PID ${first.pid}; rebuilt bundle ${rebuilt} loaded in PID ${replacement.pid}`)
    } finally {
      writeFileSync(join(directory, 'quit'), '')
    }
  }

  verify().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
