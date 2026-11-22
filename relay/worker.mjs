const model = 'gemini-3.1-flash-lite'
const limits = { minute: 15, day: 100, total: 1000 }
const maxRequestBytes = 10 * 1024 * 1024
const maxImageChars = 4 * 1024 * 1024
const tokenPattern = /^glint_[A-Za-z0-9_-]{43}$/
const headers = { 'Cache-Control': 'no-store' }
const reply = (value, status = 200) => Response.json(value, { status, headers })
const error = (code, status) => reply({ error: code }, status)
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

async function authorized(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!tokenPattern.test(token ?? '') || !/^[0-9a-f]{64}$/.test(env.GLINT_ACCESS_TOKEN_SHA256 ?? '')) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  let mismatch = 0
  for (let index = 0; index < hex.length; index++) {
    mismatch |= hex.charCodeAt(index) ^ env.GLINT_ACCESS_TOKEN_SHA256.charCodeAt(index)
  }
  return mismatch === 0
}

async function readRequest(request) {
  if (Number(request.headers.get('Content-Length')) > maxRequestBytes) return error('payload_too_large', 413)
  if (!request.body || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return error('invalid_payload', 400)
  }
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return JSON.parse(text + decoder.decode())
      size += value.byteLength
      if (size > maxRequestBytes) {
        await reader.cancel()
        return error('payload_too_large', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return error('invalid_payload', 400)
  } finally {
    reader.releaseLock()
  }
}

function geminiPayload(value) {
  if (!isObject(value) || !Array.isArray(value.contents) || value.contents.length !== 1) return
  const [content] = value.contents
  if (!isObject(content) || (content.role !== undefined && content.role !== 'user') ||
      !Array.isArray(content.parts) || !content.parts.length || content.parts.length > 5) return

  let images = 0
  let chars = 0
  const parts = []
  for (const part of content.parts) {
    if (!isObject(part) || Object.keys(part).length !== 1) return
    if (typeof part.text === 'string') {
      chars += part.text.length
      parts.push({ text: part.text })
    } else if (part.inlineData?.mimeType === 'image/png' && typeof part.inlineData.data === 'string' &&
        part.inlineData.data.startsWith('iVBORw0KGgo') && part.inlineData.data.length <= maxImageChars && ++images <= 2) {
      parts.push({ inlineData: { mimeType: 'image/png', data: part.inlineData.data } })
    } else {
      return
    }
  }

  const instructions = value.systemInstruction?.parts
  const instruction = Array.isArray(instructions) && instructions.length === 1 ? instructions[0]?.text : undefined
  if (value.systemInstruction !== undefined && typeof instruction !== 'string') return
  if (chars + (instruction?.length ?? 0) > 96_000) return

  const generationConfig = { temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'MINIMAL' } }
  const schema = value.generationConfig?.responseJsonSchema
  if (schema !== undefined) {
    if (!isObject(schema) || JSON.stringify(schema).length > 24_000) return
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseJsonSchema = schema
  }
  return {
    contents: [{ role: 'user', parts }], generationConfig,
    ...(instruction !== undefined ? { systemInstruction: { parts: [{ text: instruction }] } } : {})
  }
}

// The public Worker can only invoke this internal object after authenticating.
// A single transaction reserves each attempt before it can reach Gemini.
export class GlobalQuota {
  constructor(state) { this.storage = state.storage }

  async fetch() {
    const now = Date.now()
    const minute = Math.floor(now / 60_000)
    const day = Math.floor(now / 86_400_000)
    const accepted = await this.storage.transaction(async transaction => {
      const prior = await transaction.get('quota')
      const minuteCount = prior?.minute === minute ? prior.minuteCount : 0
      const dayCount = prior?.day === day ? prior.dayCount : 0
      const total = prior?.total ?? 0
      if (minuteCount >= limits.minute || dayCount >= limits.day || total >= limits.total) return false
      await transaction.put('quota', { minute, day, minuteCount: minuteCount + 1, dayCount: dayCount + 1, total: total + 1 })
      return true
    })
    return new Response(null, { status: accepted ? 204 : 429 })
  }
}

export async function serve(request, env, send = (url, options) => fetch(url, options)) {
  const path = new URL(request.url).pathname
  const expires = Date.parse(env.GLINT_ACCESS_EXPIRES ?? '')
  const ready = Boolean(env.GEMINI_API_KEY && /^[0-9a-f]{64}$/.test(env.GLINT_ACCESS_TOKEN_SHA256 ?? '') &&
    Number.isFinite(expires) && expires > Date.now())
  if (path === '/health' && request.method === 'GET') return reply({ ready }, ready ? 200 : 503)
  if (path !== '/v1/generate') return error('not_found', 404)
  if (request.method !== 'POST') return error('method_not_allowed', 405)
  if (!env.GEMINI_API_KEY || !Number.isFinite(expires)) return error('relay_unavailable', 503)
  if (!await authorized(request, env)) return error('invalid_access', 401)
  if (expires <= Date.now()) return error('access_expired', 403)
  const input = await readRequest(request)
  if (input instanceof Response) return input
  const payload = geminiPayload(input)
  if (!payload) return error('invalid_payload', 400)

  const quota = await env.QUOTA.get(env.QUOTA.idFromName('glint-shared-budget')).fetch('https://quota.internal/')
  if (quota.status === 429) return error('usage_limit', 429)
  if (quota.status !== 204) return error('relay_unavailable', 503)
  try {
    const response = await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(payload), redirect: 'manual', signal: AbortSignal.timeout(15_000)
    })
    if (response.status === 429) return error('provider_limit', 429)
    if (!response.ok) {
      const failure = (await response.json().catch(() => null))?.error
      const reason = failure?.details?.find(item => /^[A-Z_]{3,80}$/.test(item.reason))?.reason
      const region = /(?:user location|region).{0,25}not supported/i.test(failure?.message ?? '')
      return reply({ error: region ? 'provider_region' : 'provider_unavailable',
        upstreamStatus: response.status, ...(reason ? { upstreamReason: reason } : {}) }, 502)
    }
    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.find(part => !part.thought && typeof part.text === 'string')?.text
    return text ? reply({ text }) : error('empty_response', 502)
  } catch {
    return error('provider_transport', 502)
  }
}

export default { fetch: (request, env) => serve(request, env) }
