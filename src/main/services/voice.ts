import { app, BrowserWindow } from 'electron'
import type { Session, WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { resourcePath } from '../resource-path'
import type { TranscriptionResult, VoiceResult } from '../../shared/voice'
import { NO_SPEECH, VOICE_MAX_SECONDS, VOICE_PERMISSION_MS, VOICE_SAMPLE_RATE, WAV_HEADER_BYTES } from '../../shared/voice'

interface Attempt {
  id: number
  permissionUntil: number
  page: string
  controller: AbortController
  dispose: () => void
}

const attempts = new WeakMap<WebContents, Attempt>()

function voiceFiles() {
  return {
    executable: resourcePath('whisper', 'bin', 'whisper-cli.exe'),
    model: resourcePath('whisper', 'ggml-small-q5_1.bin')
  }
}

export function configureVoicePermissions(session: Session): void {
  function canUseMicrophone(contents: WebContents | null, isMainFrame: boolean, url?: string) {
    if (!contents || contents.isDestroyed() || !isMainFrame) return false
    const attempt = attempts.get(contents)
    return Boolean(attempt && Date.now() < attempt.permissionUntil && contents.getURL() === attempt.page &&
      (!url || url === attempt.page) && BrowserWindow.fromWebContents(contents)?.isVisible())
  }

  session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    permission === 'media' && details.mediaType === 'audio' &&
    canUseMicrophone(contents, details.isMainFrame, details.requestingUrl))
  session.setPermissionRequestHandler((contents, permission, reply, details) => {
    const types = 'mediaTypes' in details ? details.mediaTypes : undefined
    reply(permission === 'media' && types?.length === 1 && types[0] === 'audio' &&
      canUseMicrophone(contents, details.isMainFrame, details.requestingUrl))
  })
}

export function prepareVoice(contents: WebContents, id: unknown): VoiceResult {
  const win = BrowserWindow.fromWebContents(contents)
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || !win?.isVisible()) {
    return { ok: false, error: 'Open the assistant to use its microphone.' }
  }

  const { executable, model } = voiceFiles()
  if (!existsSync(executable) || !existsSync(model)) {
    return { ok: false, error: app.isPackaged
      ? 'Glint could not find its bundled voice files. Reopen Glint.exe or type your request.'
      : 'Local voice setup is missing. Run npm run setup:voice in the Glint folder or type your request.' }
  }

  cancelVoice(contents)
  const stop = () => cancelVoice(contents, id)
  const dispose = () => {
    win.off('hide', stop)
    contents.off('destroyed', stop)
    contents.off('render-process-gone', stop)
    contents.off('did-navigate', stop)
  }
  win.once('hide', stop)
  contents.once('destroyed', stop)
  contents.once('render-process-gone', stop)
  contents.once('did-navigate', stop)
  attempts.set(contents, {
    id, permissionUntil: Date.now() + VOICE_PERMISSION_MS,
    page: contents.getURL(), controller: new AbortController(), dispose
  })
  return { ok: true }
}

export function cancelVoice(contents: WebContents, id?: unknown): void {
  const attempt = attempts.get(contents)
  if (!attempt || (id !== undefined && attempt.id !== id)) return
  attempts.delete(contents)
  attempt.dispose()
  attempt.controller.abort()
}

function isVoiceWave(audio: unknown): audio is ArrayBuffer {
  if (!(audio instanceof ArrayBuffer) || audio.byteLength <= WAV_HEADER_BYTES || audio.byteLength % 2 !== 0 ||
      audio.byteLength > WAV_HEADER_BYTES + VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS) return false

  const wav = Buffer.from(audio)
  return wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(4) === wav.length - 8 &&
    wav.toString('ascii', 8, 16) === 'WAVEfmt ' && wav.readUInt32LE(16) === 16 &&
    wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt32LE(24) === VOICE_SAMPLE_RATE &&
    wav.readUInt32LE(28) === VOICE_SAMPLE_RATE * 2 && wav.readUInt16LE(32) === 2 && wav.readUInt16LE(34) === 16 &&
    wav.toString('ascii', 36, 40) === 'data' && wav.readUInt32LE(40) === wav.length - WAV_HEADER_BYTES
}

export async function transcribeVoice(
  contents: WebContents, id: unknown, language: unknown, audio: unknown
): Promise<TranscriptionResult> {
  const attempt = attempts.get(contents)
  if (!attempt || attempt.id !== id || !attempt.permissionUntil) {
    return { ok: false, error: 'This recording is no longer active. Try again.' }
  }
  attempt.permissionUntil = 0
  try {
    if (language !== 'en' && language !== 'ta') return { ok: false, error: 'Choose English or Tamil.' }
    if (!isVoiceWave(audio)) {
      return { ok: false, error: 'This recording could not be read. Try again.' }
    }

    const { executable, model } = voiceFiles()
    const env = { ...process.env }
    delete env.GEMINI_API_KEY
    const text = await new Promise<string>((resolve, reject) => {
      // An explicit basename enables the stdout segment callback for stdin inputs.
      // Without an output format flag the CLI creates no file.
      const child = execFile(executable, ['-m', basename(model), '-l', language, '-f', '-', '-of', 'transcript', '-nt', '-ng'], {
        cwd: dirname(model), encoding: 'utf8', env, windowsHide: true, timeout: 60000,
        maxBuffer: 128 * 1024, signal: attempt.controller.signal
      }, (error, stdout, stderr) => {
        // The CLI can exit zero after a decoder error. Its diagnostic is on stderr.
        if (error || stderr.includes('failed to read audio file')) reject(error || new Error('Invalid audio'))
        else resolve(stdout.trim().replace(/\s+/gu, ' '))
      })
      child.stdin?.on('error', reject)
      child.stdin?.end(Buffer.from(audio))
    })
    if (attempt.controller.signal.aborted) return { ok: false, error: 'Recording cancelled.' }
    if (!text || /^(?:\[[^\]]*\]\s*|\([^)]*\)\s*)+$/u.test(text)) return { ok: false, error: NO_SPEECH }
    if (text.length > 4000) return { ok: false, error: 'The transcript is too long. Try a shorter request.' }
    return { ok: true, text }
  } catch {
    return {
      ok: false,
      error: attempt.controller.signal.aborted ? 'Recording cancelled.' : app.isPackaged
        ? 'Local transcription failed. Try again or type your request.'
        : 'Local transcription failed. Try again, rerun npm run setup:voice, or type your request.'
    }
  } finally {
    if (attempts.get(contents) === attempt) cancelVoice(contents, id)
  }
}
