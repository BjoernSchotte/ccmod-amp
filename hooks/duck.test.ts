import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

const answer = (stdout: unknown) => ({
  value: { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false, stdout: JSON.stringify(stdout) },
})

// A playing daemon at 0 dB; every volume the plugin sets is recorded
function fakeCliamp(on: On, volumes: number[]) {
  let volume = 0
  on('process.run', async ($, e) => {
    const [, sub, , op, , params] = e.argv
    if (sub === 'status' || sub === '--version') {
      return answer({ ok: true, state: 'playing', volume, track: { title: 'Hope', station: 'Synthwave', path: 'https://x/s' } })
    }
    if (op === 'volume') {
      volume = JSON.parse(String(params)).value
      volumes.push(volume)
    }
    return answer({ job: { state: 'succeeded', result: { playlists: [] } } })
  })
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })
  on('ui.status', async () => ({ value: undefined }))
  on('tool.check', async () => ({ decision: 'ask' as const }))
  on('tool.call', async () => ({ result: 'ok' }))
  on('session.start', async ($, e) => e)
  on('command.register', async () => ({ value: undefined }) as never)
  on('tool.register', async () => ({ value: undefined }) as never)
  on('settings.read', async () => ({ value: {} }))
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await clock.settle()
}

test('an ask answered at once (auto mode) never touches the volume', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const volumes: number[] = []
  fakeCliamp(on, volumes)
  await start($, clock)

  await $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 't1' } as never)
  await $.tool.call({ tool: 'Bash', input: {}, tool_use_id: 't1' } as never)
  await clock.advance(3000)
  await clock.settle()
  expect(volumes.filter(v => v !== 0)).toEqual([])
})

test('an ask still waiting after 1.5 s ducks, and the answer restores the volume', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const volumes: number[] = []
  fakeCliamp(on, volumes)
  await start($, clock)

  await $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 't2' } as never)
  await clock.advance(1600)
  await clock.settle()
  expect(volumes.at(-1)).toBe(-12)

  await $.tool.call({ tool: 'Bash', input: {}, tool_use_id: 't2' } as never)
  await clock.settle()
  expect(volumes.at(-1)).toBe(0)
})
