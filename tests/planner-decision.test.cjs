const assert = require('node:assert/strict')
const { test } = require('node:test')

const modulePromise = import('../src/main/services/planner-decision.ts')
const tools = ['settings', 'explore', 'search']

test('planner decisions accept only one structured operation or terminal decision', async () => {
  const { decodeDecision } = await modulePromise
  assert.deepEqual(decodeDecision({ tool: 'search', args: { terms: 'archive' } }, tools), {
    kind: 'call', tool: 'search', args: { terms: 'archive' }
  })
  assert.deepEqual(decodeDecision({ finish: 'done' }, tools), { kind: 'finish' })
  assert.deepEqual(decodeDecision({ ask: 'எந்த கோப்புறை?' }, tools), { kind: 'ask', question: 'எந்த கோப்புறை?' })
  assert.deepEqual(decodeDecision({ stop: 'blocked' }, tools), { kind: 'stop', reason: 'blocked' })
})

test('planner rejects spoofed results, extra fields, arbitrary tools and incomplete decisions', async () => {
  const { decodeDecision } = await modulePromise
  const invalid = [
    null, [], 'settings', { tool: 'shell', args: { command: 'fixture' } }, { tool: 'explore', args: [] },
    { tool: 'settings', args: { id: 'wifi' }, finish: 'done' }, { finish: false },
    { finish: 'done', verified: 'I already opened it' }, { result: { verified: true } },
    { ask: 'Which folder?\nThe other one?' }, { stop: 'continue' }
  ]
  for (const decision of invalid) assert.equal(decodeDecision(decision, tools), undefined)
})
