import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceLanguage } from '../../../shared/voice'
import { NO_SPEECH, VOICE_MAX_SECONDS, VOICE_PERMISSION_MS, VOICE_SAMPLE_RATE, WAV_HEADER_BYTES } from '../../../shared/voice'

type VoicePhase = 'idle' | 'permission' | 'listening' | 'transcribing'

interface Recording {
  id: number
  language: VoiceLanguage
  chunks: Blob[]
  stream?: MediaStream
  recorder?: MediaRecorder
  timer?: number
  startedAt?: number
  stopping?: boolean
}

function releaseMicrophone(recording: Recording) {
  window.clearTimeout(recording.timer)
  if (recording.recorder && recording.recorder.state !== 'inactive') recording.recorder.stop()
  recording.stream?.getTracks().forEach(track => track.stop())
}

async function toWave(chunks: Blob[]): Promise<ArrayBuffer> {
  if (!chunks.length) throw new Error(NO_SPEECH)
  const decoder = new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE)
  const audio = await decoder.decodeAudioData(await new Blob(chunks).arrayBuffer())
  if (audio.duration < 0.35) throw new Error(NO_SPEECH)
  const samples = Math.min(audio.length, VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples * 2)
  const wav = new DataView(buffer)
  wav.setUint32(0, 0x52494646) // RIFF
  wav.setUint32(4, buffer.byteLength - 8, true)
  wav.setUint32(8, 0x57415645) // WAVE
  wav.setUint32(12, 0x666d7420) // fmt chunk
  wav.setUint32(16, 16, true)
  wav.setUint16(20, 1, true) // PCM
  wav.setUint16(22, 1, true) // mono
  wav.setUint32(24, VOICE_SAMPLE_RATE, true)
  wav.setUint32(28, VOICE_SAMPLE_RATE * 2, true)
  wav.setUint16(32, 2, true)
  wav.setUint16(34, 16, true)
  wav.setUint32(36, 0x64617461) // data chunk
  wav.setUint32(40, samples * 2, true)

  let energy = 0
  for (let i = 0; i < samples; i++) {
    let mixed = 0
    for (const channel of channels) mixed += channel[i]
    const sample = Math.max(-1, Math.min(1, mixed / channels.length))
    energy += sample * sample
    wav.setInt16(WAV_HEADER_BYTES + i * 2, sample * 32767, true)
  }
  if (energy / samples < 0.00000025) throw new Error(NO_SPEECH)
  return buffer
}

export function useVoiceInput(onDraft: (text: string, language: VoiceLanguage) => void) {
  const current = useRef<Recording | null>(null)
  const sequence = useRef(0)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const release = useCallback(() => {
    const recording = current.current
    if (!recording) return false
    current.current = null
    releaseMicrophone(recording)
    window.glintAPI.cancelVoice(recording.id)
    return true
  }, [])

  const cancel = useCallback((message = 'Recording cancelled.') => {
    if (!release()) return false
    setPhase('idle')
    setError(false)
    setMessage(message)
    return true
  }, [release])

  useEffect(() => {
    const unsubscribe = window.glintAPI.onWindowHidden(() => cancel())
    return () => { unsubscribe(); release() }
  }, [cancel, release])

  function fail(recording: Recording, message: string) {
    if (current.current !== recording) return
    release()
    setPhase('idle')
    setError(true)
    setMessage(message)
  }

  function stop() {
    const recording = current.current
    if (!recording?.recorder || recording.stopping) return
    if (recording.recorder.state !== 'recording') {
      fail(recording, 'The microphone stopped unexpectedly. Check the connection and try again.')
      return
    }
    if (recording.startedAt !== undefined && performance.now() - recording.startedAt < 350) {
      fail(recording, NO_SPEECH)
      return
    }
    recording.stopping = true
    setPhase('transcribing')
    setMessage('Transcribing on this computer…')
    releaseMicrophone(recording)
  }

  async function finalize(recording: Recording) {
    if (current.current !== recording) return
    if (!recording.stopping) {
      fail(recording, 'The microphone stopped unexpectedly. Check the connection and try again.')
      return
    }
    try {
      const audio = await toWave(recording.chunks)
      if (current.current !== recording) return
      recording.chunks.length = 0
      const result = await window.glintAPI.transcribeVoice(recording.id, recording.language, audio)
      if (current.current !== recording) return
      if (!result.ok) {
        fail(recording, result.error)
        return
      }
      current.current = null
      setPhase('idle')
      setMessage('Review and edit your transcript, then send it.')
      onDraft(result.text, recording.language)
    } catch (error) {
      fail(recording, error instanceof Error && error.message === NO_SPEECH ? NO_SPEECH :
        'The recording could not be transcribed. Try again or type your request.')
    }
  }

  async function start(language: VoiceLanguage) {
    if (current.current) return
    const recording: Recording = { id: ++sequence.current, language, chunks: [] }
    current.current = recording
    setPhase('permission')
    setError(false)
    setMessage('Opening the microphone…')
    recording.timer = window.setTimeout(() => {
      fail(recording, 'The microphone did not start. Check Windows microphone access and try again.')
    }, VOICE_PERMISSION_MS)

    try {
      const result = await window.glintAPI.prepareVoice(recording.id)
      if (current.current !== recording) return
      if (!result.ok) {
        fail(recording, result.error)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
      if (current.current !== recording) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      recording.stream = stream
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      recording.recorder = recorder
      recorder.ondataavailable = ({ data }) => {
        if (current.current === recording && data.size) recording.chunks.push(data)
      }
      recorder.onstop = () => { void finalize(recording) }
      recorder.onerror = () => fail(recording, 'Recording failed. Check your microphone and try again.')
      window.clearTimeout(recording.timer)
      recorder.start()
      recording.startedAt = performance.now()
      recording.timer = window.setTimeout(stop, VOICE_MAX_SECONDS * 1000)
      setPhase('listening')
      setMessage('Listening… Click the microphone to stop.')
    } catch (error) {
      const reason = error instanceof DOMException ? error.name : ''
      const message = reason === 'NotAllowedError' || reason === 'SecurityError'
        ? 'Microphone access was denied. Allow desktop apps in Windows Settings → Privacy & security → Microphone, then try again.'
        : reason === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
        : 'The microphone could not start. Check the device and try again.'
      fail(recording, message)
    }
  }

  return {
    phase, message, error, start, stop, cancel,
    clearMessage: () => { setMessage(''); setError(false) },
    isActive: () => Boolean(current.current)
  }
}
