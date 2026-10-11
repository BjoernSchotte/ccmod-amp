import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Lang, NowPlaying, Song, Station } from '../types'

const PANE = 'cliamp'
const now = atom({ plugin: 'cliamp', key: 'now' } as const, { isRunning: false })
const bands = atom({ plugin: 'cliamp', key: 'bands' } as const, [])
const channels = atom({ plugin: 'cliamp', key: 'channels' } as const, [])
const listeners = atom({ plugin: 'cliamp', key: 'listeners' } as const, {})
const favorites = atom({ plugin: 'cliamp', key: 'favorites' } as const, [])
const picked = atom({ plugin: 'cliamp', key: 'picked' } as const, [])
const results = atom({ plugin: 'cliamp', key: 'results' } as const, [])
const resultsTitle = atom({ plugin: 'cliamp', key: 'resultsTitle' } as const, '')
const songs = atom({ plugin: 'cliamp', key: 'songs' } as const, [])
const lyrics = atom({ plugin: 'cliamp', key: 'lyrics' } as const, null)
const note = atom({ plugin: 'cliamp', key: 'note' } as const, '')
const lang = atom({ plugin: 'cliamp', key: 'lang' } as const, 'en')
const focusUntil = atom({ plugin: 'cliamp', key: 'focusUntil' } as const, 0)
const isPaneOpen = atom({ plugin: 'cliamp', key: 'isPaneOpen' } as const, false)
const isLoaded = atom({ plugin: 'cliamp', key: 'isLoaded' } as const, false)

const BARS = ' ▁▂▃▄▅▆▇█'
const RADIO_BROWSER = 'https://all.api.radio-browser.info/json/stations'
const TAGS = ['lofi', 'jazz', 'ambient', 'electronic', 'classical', 'news']

// ── i18n ──────────────────────────────────────────────────────────────────

const TEXT = {
  en: {
    opened: 'cliamp sidebar opened.',
    notRunning: 'cliamp is not running',
    daemonHint: 'The daemon keeps playing when the sidebar is closed.',
    startDaemon: 'Start daemon',
    live: '● LIVE', paused: '❚❚ PAUSED', stopped: '■ STOPPED',
    nothing: 'Nothing playing', pickHint: 'Pick a station with 1–9',
    listening: (n: number) => `● ${n} listening`,
    focus: (m: number) => `◷ focus ${m} min`,
    search: 'SEARCH', searchPh: 'Radio Browser…', searchBtn: 'Search',
    results: 'RESULTS', close: 'close',
    favorites: 'FAVORITES', stations: 'STATIONS', discover: 'DISCOVER', heard: 'RECENTLY HEARD',
    lyrics: 'LYRICS', noLyrics: 'No lyrics for this song.',
    trending: 'Trending', local: 'Near me',
    fav: '★ fav', like: '♥ song', random: 'random', lyricsBtn: 'lyrics', retry: 'retry',
    loading: 'loading…', notFound: (q: string) => `Nothing found for “${q}”`,
    stream: 'Stream', keys: 'tab move · enter play · esc back',
    open: 'open', focusOn: (m: number) => `Focus mode: ${m} minutes, then fade out.`,
    focusOff: 'Focus mode off.', focusDone: 'Focus session done.',
    noMood: (m: string, all: string) => `Unknown mood “${m}”. Known: ${all}`,
    copied: (s: string) => `Copied: ${s}`, nothingPlaying: 'Nothing is playing.',
    noSongs: 'No songs logged yet.', langSet: (l: string) => `Language: ${l}`,
    usage: '/cliamp [now | log | focus [min|off] | mood <name> | lang de|en|auto]',
  },
  de: {
    opened: 'cliamp-Sidebar geöffnet.',
    notRunning: 'cliamp ist nicht gestartet',
    daemonHint: 'Der Daemon spielt weiter, auch wenn die Sidebar zu ist.',
    startDaemon: 'Daemon starten',
    live: '● LIVE', paused: '❚❚ PAUSE', stopped: '■ STOP',
    nothing: 'Nichts läuft', pickHint: 'Sender wählen mit 1–9',
    listening: (n: number) => `● ${n} hören zu`,
    focus: (m: number) => `◷ Fokus ${m} min`,
    search: 'SUCHE', searchPh: 'Radio Browser…', searchBtn: 'Suchen',
    results: 'ERGEBNISSE', close: 'schließen',
    favorites: 'FAVORITEN', stations: 'SENDER', discover: 'ENTDECKEN', heard: 'ZULETZT GEHÖRT',
    lyrics: 'SONGTEXT', noLyrics: 'Kein Songtext für diesen Titel.',
    trending: 'Trending', local: 'In der Nähe',
    fav: '★ Fav', like: '♥ Song', random: 'Zufall', lyricsBtn: 'Text', retry: 'neu',
    loading: 'lädt…', notFound: (q: string) => `Nichts gefunden für „${q}“`,
    stream: 'Stream', keys: 'Tab wechseln · Enter spielen · Esc zurück',
    open: 'öffnen', focusOn: (m: number) => `Fokus-Modus: ${m} Minuten, dann ausblenden.`,
    focusOff: 'Fokus-Modus aus.', focusDone: 'Fokus-Session vorbei.',
    noMood: (m: string, all: string) => `Unbekannte Stimmung „${m}“. Bekannt: ${all}`,
    copied: (s: string) => `Kopiert: ${s}`, nothingPlaying: 'Es läuft nichts.',
    noSongs: 'Noch keine Songs geloggt.', langSet: (l: string) => `Sprache: ${l}`,
    usage: '/cliamp [now | log | focus [min|off] | mood <name> | lang de|en|auto]',
  },
} as const

// Claude's `language` setting is free text ("german", "Deutsch", "de"); we speak de and en
export function langFrom(setting: unknown): Lang | undefined {
  if (typeof setting !== 'string' || !setting.trim()) return undefined
  return /^(de|german|deutsch)/i.test(setting.trim()) ? 'de' : 'en'
}

// ── pure helpers ──────────────────────────────────────────────────────────

export const spectrum = (levels: number[]): string =>
  levels.map(l => BARS.charAt(Math.min(8, Math.max(0, Math.round(l * 8))))).join('')

// cliamp's last band is always silent; dropping it and a little gain fill the meter
export const visible = (levels: number[]): number[] =>
  (levels.length === 10 ? levels.slice(0, 9) : levels).map(l => Math.min(1, l * 1.35))

// Bands as an equalizer `height` rows tall, top row first, spread over all `width` cells
export function equalizer(levels: number[], width: number, height: number): string[] {
  const n = Math.max(1, levels.length)
  const room = Math.max(n, width - (n - 1))
  const widths = levels.map((_, i) => Math.floor(room / n) + (i < room % n ? 1 : 0))
  return Array.from({ length: height }, (_, row) => {
    const floor = (height - 1 - row) * 8
    return levels
      .map((l, i) => {
        const eighths = Math.round(Math.min(1, Math.max(0, l)) * height * 8) - floor
        return (eighths >= 8 ? '█' : BARS.charAt(Math.max(0, eighths))).repeat(widths[i] ?? 1)
      })
      .join(' ')
  })
}

// cliamp's volume runs from -30 to +6 dB
export function volumeBar(db: number, cells = 10): string {
  const filled = Math.round(((Math.min(6, Math.max(-30, db)) + 30) / 36) * cells)
  return '━'.repeat(filled) + '╌'.repeat(cells - filled)
}

export const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db} dB`

// Cuts `text` to `width` cells with an ellipsis
export const fit = (text: string, width: number) =>
  text.length <= width ? text : width <= 1 ? text.slice(0, Math.max(0, width)) : `${text.slice(0, width - 1)}…`

// A runtime snapshot (`status --json` or an event's `data`) → what we draw
export function parseSnapshot(s: any): NowPlaying {
  const t = s?.track ?? {}
  return {
    isRunning: s?.ok !== false,
    state: s?.state,
    station: t.station,
    artist: t.artist,
    title: t.title,
    path: t.path,
    volume: s?.volume ?? 0,
    streamError: s?.stream_error ?? undefined,
  }
}

export const parseStatus = (json: string) => parseSnapshot(JSON.parse(json))

// A song is known once the stream's ICY tag replaced the station name (`station` is set)
export function songOf(n: NowPlaying): Song | undefined {
  if (n.state !== 'playing' || !n.station || !n.title) return undefined
  return { title: n.title, artist: n.artist, station: n.station, at: 0 }
}

export const sameSong = (a: Song | undefined, b: Song | undefined) =>
  !!a && !!b && a.title === b.title && a.artist === b.artist && a.station === b.station

export type StatusMode = 'full' | 'title' | 'spectrum' | 'off'

export function statusLine(n: NowPlaying, levels: number[], mode: StatusMode = 'full'): string | undefined {
  if (mode === 'off' || !n.isRunning || !n.state || n.state === 'stopped' || !n.title) return undefined
  const song = n.artist ? `${n.artist} – ${n.title}` : n.title
  const vis = n.state === 'playing' && levels.length ? spectrum(visible(levels)) : ''
  if (mode === 'spectrum') return vis ? `♪ ${vis}` : undefined
  const head = n.state === 'playing' ? '♪' : '⏸'
  const where = n.station && mode === 'full' ? `${n.station} · ` : ''
  return `${head} ${where}${song}${vis && mode === 'full' ? ` ${vis}` : ''}`
}

// "focus=Lofi;debug=Meditative" → { focus: 'Lofi', debug: 'Meditative' }
export const parseMoods = (spec: string): Record<string, string> =>
  Object.fromEntries(
    spec
      .split(/[;,]/)
      .map(p => p.split('=').map(s => s.trim()))
      .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
      .map(([k, v]) => [k.toLowerCase(), v]),
  )

const stationOfRadioBrowser = (s: any): Station => ({
  title: String(s.name ?? '').trim(),
  path: s.url_resolved || s.url,
  detail: [String(s.tags ?? '').split(',')[0], s.countrycode, s.bitrate ? `${s.bitrate}k` : '']
    .filter(Boolean)
    .join(' · '),
})

// ── runtime (module variables start over on a reload; the state atoms stay) ──

let opts: PluginOptions = {}
let isStreaming = false
let isPlaying = false
let eventsRunning = false
let duckedFrom: number | undefined
let lastSong = ''
let ducking: Promise<unknown> = Promise.resolve()
const waiting = new Set<string>()
let focusTimer: { cancel: () => void } | undefined

const statusMode = (): StatusMode => (opts.statusline as StatusMode) ?? 'off'
const moods = () => parseMoods(String(opts.moods ?? ''))

async function t$($: EngineInterface) {
  return TEXT[await read($, lang)]
}

async function call($: EngineInterface, op: string, params: object = {}): Promise<any> {
  const r = await $.process.run(
    ['cliamp', 'remote', 'call', op, '--params', JSON.stringify(params), '--wait'],
    { timeoutMs: 20_000 },
  )
  let job: any
  try {
    job = JSON.parse(r.stdout).job
  } catch {
    throw new Error(r.stderr.trim() || r.stdout.trim() || `${op} failed`)
  }
  if (job?.state !== 'succeeded') throw new Error(job?.error?.message ?? JSON.stringify(job?.error ?? job))
  return job.result
}

async function showStatus($: EngineInterface) {
  await $.ui.status(statusLine(await read($, now), await read($, bands), statusMode()))
}

async function persist($: EngineInterface, key: 'favorites' | 'picked' | 'songs', value: unknown) {
  await $.store.set(key, value)
}

// Takes one snapshot: draws it, logs a new song, keeps the spectrum stream alive
async function apply($: EngineInterface, n: NowPlaying) {
  // claimed before the first await: the event stream and the poll deliver the same song together
  const song = songOf(n)
  const key = song ? `${song.station}|${song.artist}|${song.title}` : ''
  const isNewSong = !!song && key !== lastSong
  if (isNewSong) lastSong = key
  const before = await read($, now)
  if (JSON.stringify(before) !== JSON.stringify(n)) await update($, now, () => n)
  const log = await read($, songs)
  if (song && isNewSong && !sameSong(log[0], song)) {
    const next = [{ ...song, at: await $.clock.now() }, ...log].slice(0, 200)
    await update($, songs, () => next)
    await update($, lyrics, () => null)
    await persist($, 'songs', next)
  }
  isPlaying = n.state === 'playing'
  if (isPlaying) streamSpectrum($)
  await showStatus($)
}

// ponytail: a second `cliamp visstream` process, one IPC frame per tick; a socket client would save the process
function streamSpectrum($: EngineInterface) {
  if (isStreaming) return
  isStreaming = true
  void (async () => {
    let rest = ''
    try {
      for await (const chunk of $.process.spawn({ argv: ['cliamp', 'visstream', '--fps', '8'] })) {
        if (!isPlaying) break
        if (chunk.stream !== 'stdout') continue
        const lines = (rest + chunk.text).split('\n')
        rest = lines.pop() ?? ''
        const last = lines.at(-1)
        if (!last) continue
        const frame = JSON.parse(last)
        await update($, bands, () => (Array.isArray(frame.bands) ? frame.bands : []))
        await showStatus($)
      }
    } catch {
      // the daemon went away; the next snapshot restarts the stream
    } finally {
      isStreaming = false
      await update($, bands, () => [])
      await showStatus($)
    }
  })()
}

// Runtime events push every state change; the slow poll only notices the daemon coming and going
function followEvents($: EngineInterface) {
  if (eventsRunning) return
  eventsRunning = true
  void (async () => {
    let rest = ''
    try {
      for await (const chunk of $.process.spawn({ argv: ['cliamp', 'remote', 'events', 'runtime.state'] })) {
        if (chunk.stream !== 'stdout') continue
        const lines = (rest + chunk.text).split('\n')
        rest = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line)
          if (ev.event === 'runtime.state' && ev.data) await apply($, parseSnapshot(ev.data))
        }
      }
    } catch {
      // stream ended with the daemon
    } finally {
      eventsRunning = false
    }
  })()
}

// The session's state starts empty at session start and again after /clear (which raises no
// session.start): whatever finds it unloaded reads the saved favorites, songs and language back
async function ensureLoaded($: EngineInterface) {
  if (await read($, isLoaded)) return
  await update($, isLoaded, () => true)
  await resolveLang($)
  await loadSaved($).catch(() => {})
  void loadListeners($).catch(() => {})
}

async function poll($: EngineInterface) {
  await ensureLoaded($)
  const r = await $.process.run(['cliamp', 'status', '--json'], { timeoutMs: 5_000 })
  const n: NowPlaying = r.exitCode === 0 ? parseStatus(r.stdout) : { isRunning: false }
  await apply($, n)
  if (!n.isRunning) return
  followEvents($)
  if ((await read($, channels)).length === 0) await loadChannels($)
}

async function loadChannels($: EngineInterface) {
  const own = await call($, 'provider.playlists', { provider: 'cliamp' })
  const list: Station[] = (own.playlists ?? []).map((p: any) => ({
    title: p.name,
    path: `https://radio.cliamp.stream/${p.id}/stream`,
    slug: p.id,
  }))
  await update($, channels, () => list)
}

async function loadListeners($: EngineInterface) {
  const r = await $.http.fetch('https://radio.cliamp.stream/statistics')
  if (!r.ok) return
  const stations = JSON.parse(r.text).stations ?? {}
  const counts: Record<string, number> = {}
  for (const [slug, s] of Object.entries<any>(stations)) counts[slug] = Number(s.active_listeners ?? 0)
  await update($, listeners, () => counts)
}

// Favorites live in the mod's store; the first run takes over cliamp's own radio favorites
async function loadSaved($: EngineInterface) {
  const favs = (await $.store.get('favorites')) as Station[] | undefined
  if (favs) {
    await update($, favorites, () => favs)
  } else {
    const radio = await call($, 'provider.playlists', { provider: 'radio' }).catch(() => ({}))
    const seeded: Station[] = (radio.playlists ?? [])
      .filter((p: any) => String(p.id).startsWith('f:'))
      .map((p: any) => ({ title: p.name, path: p.id.slice(2) }))
    await update($, favorites, () => seeded)
    await persist($, 'favorites', seeded)
  }
  const mine = ((await $.store.get('picked')) as Station[] | undefined) ?? []
  await update($, picked, () => mine)
  const log = ((await $.store.get('songs')) as Song[] | undefined) ?? []
  await update($, songs, () => log)
}

async function resolveLang($: EngineInterface) {
  const chosen = (await $.store.get('lang')) as Lang | undefined
  const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
  const fromClaude = langFrom(settings.language)
  await update($, lang, () => chosen ?? fromClaude ?? 'en')
}

async function ensureDaemon($: EngineInterface) {
  if ((await read($, now)).isRunning) return
  await $.process.run(['sh', '-c', 'nohup cliamp --daemon >/dev/null 2>&1 &'])
  for (let i = 0; i < 10; i++) {
    await poll($).catch(() => {})
    if ((await read($, now)).isRunning) return
    await $.clock.sleep(300)
  }
}

// Every button goes through here: one place reports failures in the pane
function act($: EngineInterface, work: () => Promise<unknown>) {
  return async () => {
    try {
      await update($, note, () => '')
      await work()
    } catch (err) {
      await update($, note, () => String((err as Error).message ?? err))
    }
    await poll($).catch(() => {})
  }
}

async function playStation($: EngineInterface, s: Station) {
  if (opts.autostart) await ensureDaemon($)
  await call($, 'track.play', { track: { title: s.title, path: s.path, stream: true, realtime: true } })
}

async function pickResult($: EngineInterface, s: Station) {
  await playStation($, s)
  const list = [s, ...(await read($, picked)).filter(p => p.path !== s.path)].slice(0, 8)
  await update($, picked, () => list)
  await persist($, 'picked', list)
  await closeResults($)
}

async function closeResults($: EngineInterface) {
  await update($, results, () => [])
  await update($, resultsTitle, () => '')
}

async function showResults($: EngineInterface, title: string, found: Station[]) {
  await update($, results, () => found)
  await update($, resultsTitle, () => title)
  if (found.length === 0) {
    const t = await t$($)
    await update($, note, () => t.notFound(title))
  }
}

async function search($: EngineInterface, query: string) {
  if (!query.trim()) return closeResults($)
  const r = await call($, 'provider.search', { provider: 'radio', query, limit: 15 })
  const found: Station[] = (r.tracks ?? []).map((t: any) => ({
    title: t.title,
    path: t.path,
    detail: [String(t.genre ?? '').split(',')[0], t.provider_meta?.['radio.country']].filter(Boolean).join(' · '),
  }))
  await showResults($, query, found)
}

async function discover($: EngineInterface, kind: string) {
  const l = await read($, lang)
  const q = 'hidebroken=true&order=clickcount&reverse=true&limit=15'
  const url =
    kind === 'trending'
      ? `${RADIO_BROWSER}/topclick/15?hidebroken=true`
      : kind === 'local'
        ? `${RADIO_BROWSER}/bycountrycodeexact/${l === 'de' ? 'DE' : 'US'}?${q}`
        : `${RADIO_BROWSER}/bytagexact/${encodeURIComponent(kind)}?${q}`
  const r = await $.http.fetch(url, { headers: { 'User-Agent': 'cliamp-claude-mod/0.2' } })
  if (!r.ok) throw new Error(`Radio Browser: HTTP ${r.status}`)
  const t = TEXT[l]
  const title = kind === 'trending' ? t.trending : kind === 'local' ? t.local : kind
  await showResults($, title, (JSON.parse(r.text) as any[]).map(stationOfRadioBrowser).filter(s => s.title && s.path))
}

async function toggleFavorite($: EngineInterface) {
  const n = await read($, now)
  if (!n.path) return
  const title = n.station ?? n.title ?? n.path
  const list = await read($, favorites)
  const next = list.some(f => f.path === n.path)
    ? list.filter(f => f.path !== n.path)
    : [...list, { title, path: n.path }]
  await update($, favorites, () => next)
  await persist($, 'favorites', next)
}

async function toggleLike($: EngineInterface) {
  const log = await read($, songs)
  const first = log[0]
  if (!first) return
  const next = [{ ...first, isLiked: !first.isLiked }, ...log.slice(1)]
  await update($, songs, () => next)
  await persist($, 'songs', next)
}

async function playRandom($: EngineInterface) {
  const favs = await read($, favorites)
  const pool = favs.length ? favs : await read($, channels)
  const pick = pool[Math.floor(Math.random() * pool.length)]
  if (pick) await playStation($, pick)
}

async function toggleLyrics($: EngineInterface) {
  if ((await read($, lyrics)) !== null) return update($, lyrics, () => null)
  const text = await call($, 'lyrics')
    .then(r => String(r?.lyrics ?? r?.text ?? (typeof r === 'string' ? r : '')))
    .catch(() => '')
  await update($, lyrics, () => text)
}

async function toggleLang($: EngineInterface) {
  const next: Lang = (await read($, lang)) === 'de' ? 'en' : 'de'
  await update($, lang, () => next)
  await $.store.set('lang', next)
}

async function retry($: EngineInterface) {
  const n = await read($, now)
  if (n.path) await call($, 'track.play', { track: { title: n.station ?? n.title ?? n.path, path: n.path, stream: true, realtime: true } })
}

async function openPane($: EngineInterface) {
  if (opts.autostart) await ensureDaemon($).catch(() => {})
  const r = await $.ui.open({ id: PANE, title: 'cliamp', focus: true, columns: 44 })
  await update($, isPaneOpen, () => true)
  return r
}

// ── ducking: quieter while Claude waits for you, a short dip when a turn ends ──

// Duck and unduck run one after another: an unduck never overtakes the duck it undoes
function serial($: EngineInterface, work: () => Promise<unknown>) {
  ducking = ducking.then(work, work).catch(() => {})
  return ducking
}

// An 'ask' that an auto-mode classifier or a rule answers runs within moments; only one still
// waiting after 1.5 s sits in front of the person, and only that one ducks
function duckIfStillWaiting($: EngineInterface, id: string) {
  waiting.add(id)
  $.clock.after(1500, () => {
    if (waiting.delete(id)) void serial($, () => duck($, 12))
  })
}

// The volume to return to is kept in the store too, so a reload or a crash mid-duck never leaves it lowered
async function duck($: EngineInterface, by: number) {
  const n = await read($, now)
  if (duckedFrom !== undefined || n.state !== 'playing') return
  duckedFrom = n.volume ?? 0
  await $.store.set('duckedFrom', duckedFrom)
  await call($, 'volume', { value: Math.max(-30, duckedFrom - by) })
}

async function unduck($: EngineInterface) {
  if (duckedFrom === undefined) return
  const to = duckedFrom
  duckedFrom = undefined
  await call($, 'volume', { value: to })
  await $.store.delete('duckedFrom')
}

async function restoreDuck($: EngineInterface) {
  const saved = await $.store.get('duckedFrom')
  if (typeof saved !== 'number') return
  duckedFrom = saved
  await unduck($)
}

async function dip($: EngineInterface) {
  await serial($, async () => {
    if (duckedFrom !== undefined || (await read($, now)).state !== 'playing') return
    await duck($, 8)
    await $.clock.sleep(700)
    await unduck($)
  })
}

// ── focus mode ──

async function startFocus($: EngineInterface, minutes: number) {
  const until = (await $.clock.now()) + minutes * 60_000
  await update($, focusUntil, () => until)
  await $.store.set('focusUntil', until)
  if ((await read($, now)).state !== 'playing') {
    const lofi = (await read($, channels)).find(c => c.slug === 'lofi')
    if (lofi) await playStation($, lofi)
  }
  armFocus($, minutes * 60_000)
}

function armFocus($: EngineInterface, ms: number) {
  focusTimer?.cancel()
  focusTimer = $.clock.after(Math.max(1, ms), () => endFocus($))
}

async function endFocus($: EngineInterface) {
  focusTimer = undefined
  await update($, focusUntil, () => 0)
  await $.store.delete('focusUntil')
  const start = (await read($, now)).volume ?? 0
  for (let v = start - 3; v > start - 18; v -= 3) {
    await call($, 'volume', { value: Math.max(-30, v) }).catch(() => {})
    await $.clock.sleep(1000)
  }
  await call($, 'stop').catch(() => {})
  await call($, 'volume', { value: start }).catch(() => {})
  const t = await t$($)
  $.ui.toast(t.focusDone)
}

async function stopFocus($: EngineInterface) {
  focusTimer?.cancel()
  focusTimer = undefined
  await update($, focusUntil, () => 0)
  await $.store.delete('focusUntil')
}

// ── Claude's own radio tool ──

async function findStation($: EngineInterface, query: string): Promise<Station | undefined> {
  const q = query.toLowerCase()
  const known = [...(await read($, favorites)), ...(await read($, picked)), ...(await read($, channels))]
  const hit = known.find(s => s.title.toLowerCase().includes(q))
  if (hit) return hit
  const r = await call($, 'provider.search', { provider: 'radio', query, limit: 1 })
  const t = r.tracks?.[0]
  return t ? { title: t.title, path: t.path } : undefined
}

async function radioTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const action = String(input.action ?? 'now')
  if (action !== 'now') await ensureDaemon($)
  if (action === 'play') {
    const query = String(input.query ?? '')
    const mood = moods()[query.toLowerCase()]
    const s = await findStation($, mood ?? query)
    if (!s) return `No station found for "${query}".`
    await playStation($, s)
    return `Playing ${s.title}.`
  }
  if (['pause', 'next', 'prev', 'stop'].includes(action)) await call($, action)
  if (action === 'resume') await call($, 'play')
  if (action === 'volume') await call($, 'volume', { value: Number(input.value ?? 0) })
  if (action === 'favorite') await toggleFavorite($)
  await poll($).catch(() => {})
  const n = await read($, now)
  if (!n.isRunning) return 'cliamp is not running.'
  const song = n.title ? `${n.artist ? `${n.artist} – ` : ''}${n.title}` : 'nothing'
  return `${n.state ?? 'stopped'}: ${song}${n.station ? ` on ${n.station}` : ''} (volume ${formatDb(n.volume ?? 0)})`
}

// ── slash command ──

async function runCommand($: EngineInterface, args: string): Promise<string> {
  const t = await t$($)
  const [sub = '', arg = ''] = args.trim().split(/\s+/)
  switch (sub.toLowerCase()) {
    case '':
      await openPane($)
      return t.opened
    case 'now': {
      const n = await read($, now)
      if (!n.title || n.state === 'stopped') return t.nothingPlaying
      const text = n.artist ? `${n.artist} – ${n.title}` : n.title
      await $.ui.copy({ text })
      return t.copied(text)
    }
    case 'log': {
      const log = await read($, songs)
      if (!log.length) return t.noSongs
      return log
        .slice(0, 25)
        .map(s => `${new Date(s.at).toTimeString().slice(0, 5)}  ${s.isLiked ? '♥ ' : ''}${s.artist ? `${s.artist} – ` : ''}${s.title}  (${s.station ?? ''})`)
        .join('\n')
    }
    case 'focus': {
      if (arg === 'off') {
        await stopFocus($)
        return t.focusOff
      }
      const minutes = Number(arg) > 0 ? Number(arg) : 50
      await startFocus($, minutes)
      return t.focusOn(minutes)
    }
    case 'mood': {
      const all = moods()
      const target = all[arg.toLowerCase()]
      if (!target) return t.noMood(arg, Object.keys(all).join(', '))
      const s = await findStation($, target)
      if (!s) return t.notFound(target)
      await playStation($, s)
      return `♪ ${s.title}`
    }
    case 'lang': {
      if (arg === 'auto') await $.store.delete('lang')
      else if (arg === 'de' || arg === 'en') await $.store.set('lang', arg)
      await resolveLang($)
      const l = await read($, lang)
      return TEXT[l].langSet(l)
    }
    default:
      return t.usage
  }
}

// ── hooks ──

export const register: Register = (on, options) => {
  opts = options

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.process.run(['cliamp', '--version'], { timeoutMs: 5_000 })
    } catch {
      return started // no cliamp on this machine: the mod stays dormant
    }
    await ensureLoaded($)
    await $.command.register({
      name: 'cliamp',
      description: 'cliamp radio: sidebar, now, log, focus, mood, lang',
      argumentHint: '[now|log|focus [min|off]|mood <name>|lang de|en|auto]',
    })
    await $.tool.register({
      name: 'radio',
      description:
        'Controls the cliamp internet radio the user listens to while coding. ' +
        'action: now (what is playing), play (query = station name, genre or mood), pause, resume, next, prev, stop, ' +
        'volume (value in dB, -30..6), favorite (toggle the current station).',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['now', 'play', 'pause', 'resume', 'next', 'prev', 'stop', 'volume', 'favorite'] },
          query: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['action'],
      },
    })
    void serial($, () => restoreDuck($))
    void poll($).catch(() => {})
    const until = Number((await $.store.get('focusUntil')) ?? 0)
    const left = until - (await $.clock.now())
    if (left > 0) {
      await update($, focusUntil, () => until)
      armFocus($, left)
    }
    $.clock.every(10_000, () => poll($).catch(() => {}))
    $.clock.every(180_000, () => loadListeners($).catch(() => {}))
    return started
  })

  on('command.run', { command: 'cliamp' }, async ($, e) => ({ text: await runCommand($, e.args) }))

  on('tool.call', { tool: 'mcp__cliamp__radio' }, async ($, e) => {
    const text = await radioTool($, e)
    return { result: text, text }
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    const text = `cliamp: ${String((next.error as any)?.message ?? 'failed')}`
    return { result: text, text, isError: true as const }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isPaneOpen, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && opts.duckOnAsk === true && e.tool_use_id) duckIfStillWaiting($, e.tool_use_id)
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    waiting.delete(e.tool_use_id)
    void serial($, () => unduck($))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    waiting.clear()
    if (duckedFrom !== undefined) await serial($, () => unduck($))
    else if (opts.dipOnTurnEnd === true) void dip($)
    return next(e)
  })

  // The mini player above the prompt while the sidebar is closed: a click opens it
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, now)
    if (e.props.hasSurvey || (await read($, isPaneOpen)) || !n.isRunning || n.state === 'stopped' || !n.title) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = await t$($)
    const levels = visible(await read($, bands))
    const isOn = n.state === 'playing'
    const vis = isOn && levels.length ? spectrum(levels) : ''
    const song = n.artist ? `${n.artist} – ${n.title}` : n.title
    const room = Math.max(10, e.props.bodyColumns - vis.length - 16)
    return (
      <Box gap={1}>
        <Button key="mini" plain onPress={() => openPane($)}>
          <Text color="claude">{isOn ? '♪' : '⏸'}</Text>{' '}
          {fit(n.station ? `${n.station} · ${song}` : song, room)}{' '}
          <Text color="claude">{vis}</Text>
        </Button>
        <Button key="mini-toggle" plain hotkey="p" label={isOn ? '⏸' : '▶'} onPress={act($, () => call($, 'toggle'))} />
        <Button key="mini-open" plain hotkey="o" label={t.open} onPress={() => openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const l = await read($, lang)
    const t = TEXT[l]
    const n = await read($, now)
    const levels = visible(await read($, bands))
    const favs = await read($, favorites)
    const mine = await read($, picked)
    const chans = await read($, channels)
    const counts = await read($, listeners)
    const found = await read($, results)
    const foundTitle = await read($, resultsTitle)
    const log = await read($, songs)
    const text = await read($, lyrics)
    const msg = await read($, note)
    const until = await read($, focusUntil)
    const clock = await $.clock.now()
    const width = Math.max(24, e.props.bodyColumns)
    const isOn = n.state === 'playing'
    const hasTrack = n.state !== 'stopped' && !!n.title
    const isFav = !!n.path && favs.some(f => f.path === n.path)
    const current = chans.find(c => c.path === n.path)
    const live = current?.slug ? counts[current.slug] ?? 0 : 0
    const focusLeft = until ? Math.max(0, Math.ceil((until - clock) / 60_000)) : 0

    const heading = (label: string, extra?: ReturnType<typeof h>) => (
      <Box marginTop={1} gap={1}>
        <Text dimColor bold>{label}</Text>
        <Text dimColor>{'─'.repeat(Math.max(0, width - label.length - (extra ? 15 : 2)))}</Text>
        {extra ?? ''}
      </Box>
    )

    // 1–9 play the first nine rows as drawn: results, favorites, picked, channels
    let index = 0
    const row = (s: Station, key: string, onPress: () => Promise<void>) => {
      const i = index++
      const isCurrent = hasTrack && n.path === s.path
      const marks = `${isCurrent ? (isOn ? ' ♪' : ' ⏸') : ''}${favs.some(f => f.path === s.path) ? ' ★' : ''}`
      const count = s.slug && counts[s.slug] ? `● ${counts[s.slug]}` : ''
      const detail = [s.detail, count].filter(Boolean).join(' · ')
      const room = width - 3
      const title = fit(s.title, room - marks.length)
      const rest = room - title.length - marks.length - 2
      return (
        <Button key={key} plain {...(i < 9 ? { hotkey: String(i + 1) } : {})} onPress={onPress}>
          {i < 9 ? '' : '   '}
          <Text color={isCurrent ? 'claude' : undefined} bold={isCurrent}>{title}</Text>
          <Text color="claude">{marks}</Text>
          {detail && rest > 3 ? <Text dimColor>{'  ' + fit(detail, rest)}</Text> : ''}
        </Button>
      )
    }

    if (!n.isRunning) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text bold>{t.notRunning}</Text>
            <Text dimColor>{t.daemonHint}</Text>
          </Box>
          <Button key="daemon" plain hotkey="s" onPress={act($, () => ensureDaemon($))}>
            <Text color="claude" bold>{t.startDaemon}</Text>
          </Button>
          <Button key="lang" plain hotkey="t" label={l.toUpperCase()} onPress={() => toggleLang($)} />
          {msg ? <Text color="error">✗ {msg}</Text> : ''}
        </Box>
      )
    }

    // equalizer rows top to bottom, colored like a VU meter
    const eqColors = ['error', 'warning', 'claude', 'success'] as const
    const eq = equalizer(isOn && levels.length ? levels : Array(9).fill(0), width - 4, 4)
    const badge = [focusLeft ? t.focus(focusLeft) : '', live ? t.listening(live) : ''].filter(Boolean).join('  ')

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor={isOn ? 'claude' : undefined} borderDimColor={!isOn} paddingX={1}>
          <Box justifyContent="space-between">
            <Text color={isOn ? 'error' : undefined} dimColor={!isOn} bold>
              {isOn ? t.live : n.state === 'paused' ? t.paused : t.stopped}
            </Text>
            <Text dimColor>{badge}</Text>
          </Box>
          <Text color="claude" wrap="truncate">{hasTrack ? `${n.station ?? ''}${isFav ? ' ★' : ''}` : ' '}</Text>
          <Text bold wrap="truncate">{hasTrack ? `${n.title}${log[0]?.isLiked && log[0]?.title === n.title ? ' ♥' : ''}` : t.nothing}</Text>
          <Text dimColor wrap="truncate">{hasTrack ? n.artist ?? ' ' : t.pickHint}</Text>
          <Box flexDirection="column" marginTop={1}>
            {eq.map((line, r) => (
              <Text color={eqColors[r] ?? 'success'} dimColor={!isOn}>{line}</Text>
            ))}
          </Box>
        </Box>
        {n.streamError ? (
          <Box gap={1}>
            <Text color="error" wrap="truncate">✗ {t.stream}: {n.streamError}</Text>
            <Button key="retry" plain hotkey="w" label={t.retry} onPress={act($, () => retry($))} />
          </Box>
        ) : ''}
        <Box paddingX={1} gap={2}>
          <Button key="prev" plain hotkey="b" label="⏮" onPress={act($, () => call($, 'prev'))} />
          <Button key="toggle" plain hotkey="p" label={isOn ? '⏸' : '▶'} onPress={act($, () => call($, 'toggle'))} />
          <Button key="next" plain hotkey="n" label="⏭" onPress={act($, () => call($, 'next'))} />
          <Button key="stop" plain hotkey="s" label="⏹" onPress={act($, () => call($, 'stop'))} />
        </Box>
        <Box paddingX={1} justifyContent="space-between">
          <Box gap={1}>
            <Button key="down" plain hotkey="d" label="−" onPress={act($, () => call($, 'volume.adjust', { value: -3 }))} />
            <Text color="claude">{volumeBar(n.volume ?? 0)}</Text>
            <Button key="up" plain hotkey="u" label="+" onPress={act($, () => call($, 'volume.adjust', { value: 3 }))} />
          </Box>
          <Text dimColor>{formatDb(n.volume ?? 0)}</Text>
        </Box>
        <Box paddingX={1} columnGap={2} flexWrap="wrap">
          <Button key="fav" plain hotkey="l" label={t.fav} onPress={act($, () => toggleFavorite($))} />
          <Button key="like" plain hotkey="m" label={t.like} onPress={act($, () => toggleLike($))} />
          <Button key="random" plain hotkey="r" label={t.random} onPress={act($, () => playRandom($))} />
          <Button key="lyrics" plain hotkey="y" label={t.lyricsBtn} onPress={act($, () => toggleLyrics($))} />
          <Button key="lang" plain hotkey="t" label={l.toUpperCase()} onPress={() => toggleLang($)} />
        </Box>
        {msg ? <Text color="error" wrap="truncate">✗ {msg}</Text> : ''}

        {text !== null ? heading(t.lyrics) : ''}
        {text !== null ? (
          <Text dimColor={!text}>{text ? text.split('\n').slice(0, 16).join('\n') : t.noLyrics}</Text>
        ) : ''}

        {Input ? heading(t.search) : ''}
        {Input ? (
          <Box gap={1}>
            <Button key="find" plain hotkey="f" label="⌕" onPress={() => $.ui.focus({ requestId: PANE, key: 'search' })} />
            <Input key="search" placeholder={t.searchPh} submitLabel={t.searchBtn} onSubmit={q => act($, () => search($, q))()} />
          </Box>
        ) : ''}

        {found.length > 0
          ? heading(`${t.results} · ${fit(foundTitle, 14)}`, <Button key="close-results" plain hotkey="x" label={t.close} onPress={() => closeResults($)} />)
          : ''}
        {found.map((s, i) => row(s, `r${i}`, act($, () => pickResult($, s))))}

        {favs.length > 0 ? heading(t.favorites) : ''}
        {favs.map((s, i) => row(s, `f${i}`, act($, () => playStation($, s))))}

        {heading(t.stations)}
        {mine.map((s, i) => row(s, `p${i}`, act($, () => playStation($, s))))}
        {chans.length === 0 ? <Text dimColor>{t.loading}</Text> : ''}
        {chans.map((s, i) => row(s, `s${i}`, act($, () => playStation($, s))))}

        {heading(t.discover)}
        <Box flexWrap="wrap" columnGap={2}>
          <Button key="d-trending" plain label={t.trending} onPress={act($, () => discover($, 'trending'))} />
          <Button key="d-local" plain label={t.local} onPress={act($, () => discover($, 'local'))} />
          {TAGS.map(tag => (
            <Button key={`d-${tag}`} plain label={tag} onPress={act($, () => discover($, tag))} />
          ))}
        </Box>

        {log.length > 0 ? heading(t.heard) : ''}
        {log.slice(0, 5).map(s => (
          <Text wrap="truncate">
            <Text dimColor>{new Date(s.at).toTimeString().slice(0, 5)} </Text>
            {s.isLiked ? <Text color="claude">♥ </Text> : ''}
            {s.artist ? `${s.artist} – ` : ''}
            {s.title}
          </Text>
        ))}

        <Box marginTop={1}>
          <Text dimColor wrap="truncate">{t.keys}</Text>
        </Box>
      </Box>
    )
  })
}
