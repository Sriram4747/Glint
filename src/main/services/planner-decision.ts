export type Args = Record<string, unknown>

export function record(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function fields(value: Args, ...keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

export function literal<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

export function decodeDecision<T extends string>(value: unknown, tools: readonly T[]) {
  if (!record(value)) return
  if (fields(value, 'finish') && value.finish === 'done') return { kind: 'finish' as const }
  if (fields(value, 'ask') && typeof value.ask === 'string' && value.ask.length <= 220 &&
      /^[^\r\n!?]+\?$/u.test(value.ask)) {
    return { kind: 'ask' as const, question: value.ask }
  }
  if (fields(value, 'stop') && literal(value.stop, ['blocked', 'guidance', 'unavailable'] as const)) {
    return { kind: 'stop' as const, reason: value.stop }
  }
  if (fields(value, 'tool', 'args') && literal(value.tool, tools) && record(value.args)) {
    return { kind: 'call' as const, tool: value.tool, args: value.args }
  }
}
