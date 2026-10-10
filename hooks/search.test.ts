import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  component: 'Pane' as const,
  requestId: 'cliamp',
  props: {
    title: 'cliamp',
    isFocused: true,
    bodyColumns: 42,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
}

const station = { title: 'SomaFM Lush', path: 'https://ice6.somafm.com/lush-128-mp3', genre: 'lounge', stream: true }

const answer = (stdout: unknown) => ({
  value: { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false, stdout: JSON.stringify(stdout) },
})

// A fake cliamp daemon beneath the plugin: status, search, playlists and play
function fakeCliamp(on: On) {
  mock.clock(on)
  mock.store(on)
  let playing = ''
  on('process.run', async ($, e) => {
    const [, sub, , op, , params] = e.argv
    if (sub === 'status') {
      return answer({
        ok: true,
        state: playing ? 'paused' : 'stopped',
        volume: 0,
        ...(playing ? { track: { title: playing, path: station.path } } : {}),
      })
    }
    if (op === 'track.play') playing = JSON.parse(String(params)).track.title
    const result =
      op === 'provider.search' ? { tracks: [station] }
        : op === 'provider.playlists' ? { playlists: [{ id: 'lofi', name: 'Lofi' }] }
          : {}
    return answer({ job: { state: 'succeeded', result } })
  })
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  on('ui.status', async () => ({ value: undefined }))
  on('settings.read', async () => ({ value: {} }))
  on('http.fetch', async () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }) as never)
}

test('a picked search result closes the results and joins the stations', async ($, on) => {
  fakeCliamp(on)
  const ui = await $.ui.mount({ plugin: 'cliamp', surface: 'terminal', ...PANE })
  // the first draw finds the daemon not yet polled; pressing start polls it into "running"
  await ui.press({ key: 'daemon' })

  await ui.input({ key: 'search', text: 'lush' })
  expect(await ui.find({ key: 'r0' })).toBeDefined()
  expect(await ui.find({ key: 'close-results' })).toBeDefined()

  await ui.press({ key: 'r0' })
  expect(await ui.find({ key: 'r0' })).toBe(undefined)
  expect(await ui.find({ key: 'close-results' })).toBe(undefined)
  expect((await ui.find({ key: 'p0' }))?.text).toContain('SomaFM Lush')
  await ui.unmount()
})

test('results close with x without playing anything', async ($, on) => {
  fakeCliamp(on)
  const ui = await $.ui.mount({ plugin: 'cliamp', surface: 'terminal', ...PANE })
  await ui.press({ key: 'daemon' })
  await ui.input({ key: 'search', text: 'lush' })
  await ui.press({ key: 'close-results' })
  expect(await ui.find({ key: 'r0' })).toBe(undefined)
  expect(await ui.find({ key: 'p0' })).toBe(undefined)
  await ui.unmount()
})
