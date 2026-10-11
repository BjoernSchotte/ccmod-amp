import { expect, test } from 'claude-code/testing'

import {
  equalizer, fit, formatDb, langFrom, parseMoods, parseStatus, sameSong, songOf, spectrum, statusLine, visible, volumeBar,
} from './register'

const playing = JSON.stringify({
  ok: true,
  state: 'playing',
  volume: -6,
  track: { title: 'Hope', artist: 'Meninjau', station: 'Synthwave', path: 'https://x/s', stream: true },
  stream_error: null,
})

test('status line modes', async () => {
  const n = parseStatus(playing)
  expect(statusLine(n, [0, 0.5, 1], 'full')).toBe('♪ Synthwave · Meninjau – Hope  ▅█')
  expect(statusLine(n, [0, 0.5, 1], 'title')).toBe('♪ Meninjau – Hope')
  expect(statusLine(n, [0, 0.5, 1], 'spectrum')).toBe('♪  ▅█')
  expect(statusLine(n, [1], 'off')).toBe(undefined)
  expect(statusLine({ ...n, state: 'paused' }, [1, 1])).toBe('⏸ Synthwave · Meninjau – Hope')
  expect(statusLine({ isRunning: false }, [1])).toBe(undefined)
})

test('the silent tenth band is dropped and the rest amplified, clamped', async () => {
  expect(visible([1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]).length).toBe(9)
  expect(visible([1, 0.5])).toEqual([1, 0.675])
  expect(spectrum([-1, 2])).toBe(' █')
})

test('equalizer fills the whole width and stacks a partial top', async () => {
  const rows = equalizer([1, 0.75, 0], 11, 2)
  expect(rows.every(r => r.length === 11)).toBe(true)
  expect(rows).toEqual(['███ ▄▄▄    ', '███ ███    '])
})

test('volume bar and dB label', async () => {
  expect(volumeBar(-30, 4)).toBe('╌╌╌╌')
  expect(volumeBar(6, 4)).toBe('━━━━')
  expect(volumeBar(-12, 4)).toBe('━━╌╌')
  expect(formatDb(3)).toBe('+3 dB')
  expect(formatDb(-6)).toBe('-6 dB')
  expect(formatDb(0)).toBe('0 dB')
})

test('Claude language setting maps to de or en', async () => {
  expect(langFrom('german')).toBe('de')
  expect(langFrom('Deutsch')).toBe('de')
  expect(langFrom('de-DE')).toBe('de')
  expect(langFrom('english')).toBe('en')
  expect(langFrom('japanese')).toBe('en')
  expect(langFrom('')).toBe(undefined)
  expect(langFrom(undefined)).toBe(undefined)
})

test('a song is only logged once the ICY tag arrived, and once per song', async () => {
  const n = parseStatus(playing)
  const song = songOf(n)
  expect(song?.title).toBe('Hope')
  expect(songOf({ ...n, station: undefined })).toBe(undefined)
  expect(songOf({ ...n, state: 'paused' })).toBe(undefined)
  expect(sameSong(song, { ...song!, at: 123 })).toBe(true)
  expect(sameSong(song, { ...song!, title: 'Other' })).toBe(false)
})

test('moods parse from the option string', async () => {
  expect(parseMoods('focus=Lofi; Debug = Meditative;broken;=x')).toEqual({ focus: 'Lofi', debug: 'Meditative' })
})

test('fit cuts with an ellipsis', async () => {
  expect(fit('Synthwave', 20)).toBe('Synthwave')
  expect(fit('SomaFM Groove Salad', 10)).toBe('SomaFM Gr…')
})

test('the radio tool reads its arguments off the event, not off e.input (issue #1)', async $ => {
  const r = await $.tool.call({ tool: 'mcp__cliamp__radio', action: 'now' })
  expect(r.text).toBe('cliamp is not running.')
})
