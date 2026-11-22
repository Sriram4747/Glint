import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { GlobalQuota, serve } from '../relay/worker.mjs'

const token = 'glint_' + 'a'.repeat(43)
const credentials = {
  GEMINI_API_KEY: 'test-fixture-key',
  GLINT_ACCESS_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
  GLINT_ACCESS_EXPIRES: new Date(Date.now() + 60_000).toISOString()
}
const prompt = { contents: [{ parts: [{ text: 'Test prompt' }] }] }

function incoming(body = prompt, authorization = `Bearer ${token}`, path = '/v1/generate') {
  return new Request('https://relay.example' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body)
  })
}

function quotaBinding() {
  const values = new Map()
  let queued = Promise.resolve()
  const quota = new GlobalQuota({
    storage: {
      transaction(fn) {
        const operation = queued.then(() => fn({
          get: key => values.get(key),
          put: (key, value) => values.set(key, value)
        }))
        queued = operation.catch(() => {})
        return operation
      }
    }
  })
  return { idFromName: name => name, get: () => quota }
}

test('rejects missing, wrong and expired access before parsing or using Gemini', async () => {
  const unexpected = () => assert.fail('This request should never reach Gemini.')
  assert.equal((await serve(incoming(prompt, ''), credentials, unexpected)).status, 401)
  assert.equal((await serve(incoming(prompt, 'Bearer glint_' + 'b'.repeat(43)), credentials, unexpected)).status, 401)
  const expired = { ...credentials, GLINT_ACCESS_EXPIRES: '2000-01-01T00:00:00Z' }
  assert.deepEqual(await (await serve(incoming(), expired, unexpected)).json(), { error: 'access_expired' })
  assert.equal((await serve(incoming(prompt, undefined, '/v1beta/models'), credentials, unexpected)).status, 404)
})

test('the upstream model, allowed fields and output limit are owned by the relay', async () => {
  const env = { ...credentials, QUOTA: quotaBinding() }
  const schema = { type: 'object', properties: { done: { type: 'boolean' } } }
  const request = incoming({
    ...prompt, model: 'expensive-model', tools: [{ urlContext: {} }],
    generationConfig: { maxOutputTokens: 20000, candidateCount: 20, responseJsonSchema: schema }
  })
  const response = await serve(request, env, (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
    assert.equal(options.headers['x-goog-api-key'], 'test-fixture-key')
    assert.equal(options.redirect, 'manual')
    const body = JSON.parse(options.body)
    assert.equal(body.tools, undefined)
    assert.equal(body.generationConfig.maxOutputTokens, 4096)
    assert.equal(body.generationConfig.candidateCount, undefined)
    assert.deepEqual(body.generationConfig.responseJsonSchema, schema)
    return Response.json({ candidates: [{ content: { parts: [{ text: 'ready' }] } }], internal: 'hidden' })
  })
  assert.deepEqual(await response.json(), { text: 'ready' })
})

test('rejects tool parts and oversized input independently of Gemini', async () => {
  const env = { ...credentials, QUOTA: quotaBinding() }
  const unexpected = () => assert.fail('This request should never reach Gemini.')
  const tools = { contents: [{ parts: [{ fileData: { fileUri: 'gs://fixture' } }] }] }
  assert.equal((await serve(incoming(tools), env, unexpected)).status, 400)
  const big = { contents: [{ parts: [{ text: 'a'.repeat(10 * 1024 * 1024) }] }] }
  assert.equal((await serve(incoming(big), env, unexpected)).status, 413)
})

test('the shared quota stops concurrent requests before the upstream call', async () => {
  const env = { ...credentials, QUOTA: quotaBinding() }
  let upstreamCalls = 0
  const responses = await Promise.all(Array.from({ length: 24 }, () => serve(incoming(), env, () => {
    upstreamCalls++
    return new Response('Private upstream details', { status: 500 })
  })))
  assert.equal(upstreamCalls, 15)
  assert.equal(responses.filter(response => response.status === 429).length, 9)
  assert.deepEqual(await (await responses.find(response => response.status === 502)).json(),
    { error: 'provider_unavailable', upstreamStatus: 500 })
})
