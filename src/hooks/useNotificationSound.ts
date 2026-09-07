import * as React from 'react'

const STORAGE_KEY = 'gcos-notification-sound-muted'

let audioCtx: AudioContext | null = null
let unlocked = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

function unlockAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
  unlocked = true
}

// Browsers block audio until a genuine user gesture — arm a one-time
// listener rather than ever claiming guaranteed playback.
if (typeof document !== 'undefined') {
  const events = ['pointerdown', 'keydown'] as const
  const handler = () => {
    unlockAudio()
    events.forEach((e) => document.removeEventListener(e, handler))
  }
  events.forEach((e) => document.addEventListener(e, handler, { once: true }))
}

/** A short, two-tone chime — generated via Web Audio, not a bundled/fetched asset. Never loops. */
function playChime() {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.setValueAtTime(1175, now + 0.12)
  osc.connect(gain)
  osc.start(now)
  osc.stop(now + 0.3)
}

export function isNotificationSoundMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setNotificationSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Per-viewer convenience only — a failed write just means the
    // preference doesn't persist across reloads, nothing breaks.
  }
}

const playedEventIds = new Set<string>()

/**
 * Plays the chime for one notification event, deduplicated by the
 * notification's own id (so a Realtime reconnect/redelivery, or a
 * component remounting its subscription, can never double-play for
 * the same row) and gated by both the mute preference and whether a
 * real user gesture has unlocked audio yet — silently does nothing
 * in either case rather than throwing or queuing.
 */
export function playNotificationSound(notificationId: string) {
  if (playedEventIds.has(notificationId)) return
  playedEventIds.add(notificationId)
  if (playedEventIds.size > 500) {
    const oldest = playedEventIds.values().next().value
    if (oldest) playedEventIds.delete(oldest)
  }
  if (isNotificationSoundMuted() || !unlocked) return
  try {
    playChime()
  } catch {
    // Best-effort only — a notification sound failing must never
    // break the notification itself from being recorded/shown.
  }
}

/** Drives a mute/unmute control (e.g. in the Notifications dropdown). */
export function useNotificationSoundPreference() {
  const [muted, setMutedState] = React.useState(isNotificationSoundMuted)
  const setMuted = React.useCallback((next: boolean) => {
    setNotificationSoundMuted(next)
    setMutedState(next)
  }, [])
  return { muted, setMuted }
}
