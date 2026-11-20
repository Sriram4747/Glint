const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const electron = require('electron')

const profile = mkdtempSync(join(tmpdir(), 'glint-desktop-test-'))
const env = { ...process.env }
for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GEMINI_API_KEY']) delete env[key]
for (const phase of ['fresh', 'restart', 'legacy', 'reminder', 'corrupt']) {
  if (phase === 'legacy') writeFileSync(join(profile, 'settings.json'), JSON.stringify({
    ai: { apiKey: 'local-fixture-only' }, appearance: { accentColor: '#10893e' }
  }))
  if (phase === 'corrupt') writeFileSync(join(profile, 'settings.json'), '{broken fixture')
  const run = spawnSync(electron, [join(__dirname, 'session.cjs'), profile, phase], {
    cwd: profile, env, windowsHide: true, stdio: 'inherit', timeout: 180000
  })
  if (run.error) throw run.error
  if (run.status !== 0) process.exit(run.status || 1)
}
