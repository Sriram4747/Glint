import { readFileSync } from 'node:fs'
import { app } from 'electron'
import { resourcePath } from '../resource-path'

function loadBundledRelay(): { endpoint: string; token: string } | undefined {
  if (!app.isPackaged) return
  try {
    const { endpoint, token } = JSON.parse(readFileSync(resourcePath('gemini-relay.json'), 'utf8'))
    if (typeof endpoint !== 'string' || typeof token !== 'string' || !/^glint_[A-Za-z0-9_-]{43}$/.test(token)) return
    const url = new URL(endpoint)
    if (url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) {
      return { endpoint: url.origin, token }
    }
  } catch {
    // A package can also be built for direct API-key use.
  }
}

export const bundledRelay = loadBundledRelay()

const errors = {
  invalid_access: 'Access for this Glint build was revoked or changed.',
  access_expired: 'Online AI access for this Glint build has expired.',
  usage_limit: 'This Glint build has reached its shared AI usage limit.',
  provider_limit: 'Gemini has reached its current usage limit.',
  invalid_payload: 'The hosted AI service could not read this request.',
  payload_too_large: 'The capture or request is too large for the hosted AI service.'
} as const

export async function requestGeminiRelay(payload: unknown, signal?: AbortSignal): Promise<string> {
  if (!bundledRelay) throw new Error('This Glint build has no hosted AI connection.')
  const timeout = AbortSignal.timeout(22_000)
  let result: { error?: string; text?: string }
  let ok: boolean
  try {
    const response = await fetch(bundledRelay.endpoint + '/v1/generate', {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bundledRelay.token}` },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify(payload)
    })
    ok = response.ok
    result = await response.json()
  } catch {
    signal?.throwIfAborted()
    throw new Error('Glint could not reach its hosted AI service.')
  }
  if (ok && typeof result?.text === 'string' && result.text) return result.text
  const code = result?.error
  throw new Error(code && Object.hasOwn(errors, code) ? errors[code as keyof typeof errors] :
    'Glint’s hosted AI service is temporarily unavailable.')
}
