const { createHash, randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { parseEnv } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')

const root = resolve(__dirname, '..')
const releaseDir = join(root, '.glint-release')
const releaseConfig = join(releaseDir, 'relay.json')
const pendingConfig = join(releaseDir, 'pending-relay.json')
const envFile = join(root, '.env')
const tokenPattern = /^glint_[A-Za-z0-9_-]{43}$/

function wrangler(args, secrets) {
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  delete env.GEMINI_API_KEY
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=wrangler@4.166.0',
    '--', 'wrangler', ...args, '--config', 'relay/wrangler.jsonc'], {
    cwd: root, env, input: secrets, encoding: 'utf8', windowsHide: true, timeout: 120_000
  })
  if (!secrets) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
  }
  if (result.error || result.status !== 0) {
    throw new Error(`Wrangler ${args.join(' ')} failed${result.error?.code ? ` (${result.error.code})` : ''}.`)
  }
  return result.stdout
}

async function request(url, options = {}) {
  return fetch(url, { signal: AbortSignal.timeout(25_000), ...options, redirect: 'error' })
}

async function waitForHealth(endpoint) {
  const deadline = Date.now() + 90_000
  let status
  do {
    try {
      const health = await request(endpoint + '/health', { signal: AbortSignal.timeout(6000) })
      status = `HTTP ${health.status}`
      if (health.ok && (await health.json()).ready === true) return
    } catch (error) {
      status = error.cause?.code || error.name
    }
    await delay(5000)
  } while (Date.now() < deadline)
  throw new Error(`The deployed relay did not report ready over HTTPS (${status}).`)
}

async function main() {
  if (!process.env.npm_execpath) throw new Error('Run this through npm run relay:deploy.')
  const key = (process.env.GEMINI_API_KEY || (existsSync(envFile) &&
    parseEnv(readFileSync(envFile, 'utf8')).GEMINI_API_KEY) || '').trim()
  if (!key) throw new Error('A Gemini key is needed in the maintainer environment or the project .env.')
  const rotate = process.argv.includes('--rotate')
  const previousPath = [pendingConfig, releaseConfig].find(existsSync)
  const previous = previousPath && JSON.parse(readFileSync(previousPath, 'utf8'))
  const deployment = wrangler(['deploy'])
  const endpoint = deployment.match(/https:\/\/glint-gemini-relay\.[a-z0-9-]+\.workers\.dev\b/i)?.[0]
  if (!endpoint) throw new Error('Wrangler did not report the public workers.dev endpoint.')

  const keep = !rotate && previous?.endpoint === endpoint && tokenPattern.test(previous.token) &&
    Date.parse(previous.expires) > Date.now()
  const config = keep ? previous : {
    endpoint, token: 'glint_' + randomBytes(32).toString('base64url'),
    expires: new Date(Date.now() + 21 * 86_400_000).toISOString()
  }
  const secrets = JSON.stringify({
    GEMINI_API_KEY: key, GLINT_ACCESS_TOKEN_SHA256: createHash('sha256').update(config.token).digest('hex'),
    GLINT_ACCESS_EXPIRES: config.expires
  })
  wrangler(['secret', 'bulk'], secrets)
  mkdirSync(releaseDir, { recursive: true })
  writeFileSync(pendingConfig, JSON.stringify(config), { mode: 0o600 })
  console.log('Checking the deployed HTTPS endpoint.')
  await waitForHealth(endpoint)
  const url = endpoint + '/v1/generate'
  const unauthenticated = await request(url, { method: 'POST' })
  if (unauthenticated.status !== 401) throw new Error('The public endpoint did not reject an unauthenticated call.')
  const response = await request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word READY.' }] }] })
  })
  const result = await response.json()
  if (!response.ok || !/\bREADY\b/i.test(result.text ?? '')) {
    const reason = typeof result.error === 'string' && /^[a-z_]+$/.test(result.error) ? `, ${result.error}` : ''
    const upstream = Number.isInteger(result.upstreamStatus) ? `, Gemini HTTP ${result.upstreamStatus}` : ''
    const upstreamReason = typeof result.upstreamReason === 'string' && /^[A-Z_]{3,80}$/.test(result.upstreamReason)
      ? `, ${result.upstreamReason}` : ''
    throw new Error(`The hosted Gemini check failed (HTTP ${response.status}${reason}${upstream}${upstreamReason}).`)
  }
  renameSync(pendingConfig, releaseConfig)
  console.log(`Verified hosted Gemini relay at ${endpoint}. Portable access expires ${config.expires}.`)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
