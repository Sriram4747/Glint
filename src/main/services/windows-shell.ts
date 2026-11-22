import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { resourcePath } from '../resource-path'

const runFile = promisify(execFile)

export class WindowsActionError extends Error {}

export async function waitForShell<T>(dispatch: Promise<T>, signal?: AbortSignal): Promise<T> {
  const deadline = AbortSignal.timeout(5000)
  const stop = signal ? AbortSignal.any([signal, deadline]) : deadline
  stop.throwIfAborted()
  let onAbort: () => void = () => {}
  try {
    return await Promise.race([dispatch, new Promise<never>((_, reject) => {
      onAbort = () => reject(stop.reason)
      stop.addEventListener('abort', onAbort, { once: true })
    })])
  } finally {
    stop.removeEventListener('abort', onAbort)
  }
}

export async function windowsScript(script: string, variables: Record<string, string> = {}, options: {
  timeout?: number
  signal?: AbortSignal
  maxBuffer?: number
} = {}) {
  const windows = process.env.SystemRoot
  if (!windows) throw new WindowsActionError('The Windows system directory is unavailable.')
  const powershell = win32.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const policy = app.isPackaged ? ['-ExecutionPolicy', 'RemoteSigned'] : []
  const { stdout } = await runFile(powershell, [
    '-NoProfile', '-NonInteractive', '-Sta', ...policy, '-File', resourcePath(script)
  ], {
    env: { ...process.env, ...variables }, windowsHide: true, encoding: 'utf8',
    timeout: options.timeout ?? 8500, signal: options.signal, maxBuffer: options.maxBuffer ?? 64 * 1024
  })
  return stdout.trim()
}

export function isLocalPath(path: string) {
  const normalized = win32.normalize(path)
  return /^[a-z]:\\[^\\]/i.test(normalized) && !normalized.slice(2).includes(':')
}

export async function openExplorer(folder: string, label: string, item?: string, signal?: AbortSignal) {
  if (folder) {
    if (!isLocalPath(folder) || !(await stat(folder)).isDirectory()) {
      throw new WindowsActionError(`The folder for ${label} is unavailable.`)
    }
    folder = await realpath(folder)
    if (!isLocalPath(folder)) throw new WindowsActionError('Explorer navigation requires a local folder.')
  }
  let dispatched = false
  for (let attempt = 0; attempt < (item ? 1 : 2); attempt++) {
    signal?.throwIfAborted()
    try {
      if (item) shell.showItemInFolder(item)
      else if (!folder) await waitForShell(shell.openExternal('shell:MyComputerFolder'), signal)
      else if (await waitForShell(shell.openPath(folder), signal)) continue
      dispatched = true
      const status = await windowsScript('verify-explorer.ps1', {
        GLINT_EXPLORER_FOLDER: folder, GLINT_EXPLORER_ITEM: item ?? ''
      }, { signal })
      if (status === 'verified') {
        return item ? `${label} is selected in File Explorer.` : `${label} is open in File Explorer.`
      }
    } catch {
      signal?.throwIfAborted()
    }
  }
  throw new WindowsActionError(dispatched
    ? `Windows received the request, but Glint could not verify ${label} in File Explorer.`
    : `Windows could not open ${label} in File Explorer.`)
}
