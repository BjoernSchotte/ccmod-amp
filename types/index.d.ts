export type Station = { title: string; path: string; detail?: string; slug?: string }

export type Song = { title: string; artist?: string; station?: string; at: number; isLiked?: boolean }

export type Lang = 'de' | 'en'

export type NowPlaying = {
  isRunning: boolean
  state?: string
  station?: string
  artist?: string
  title?: string
  path?: string
  volume?: number
  streamError?: string
}

declare module 'claude-code' {
  interface PluginState {
    cliamp: {
      now: NowPlaying
      bands: number[]
      channels: Station[]
      listeners: Record<string, number>
      favorites: Station[]
      picked: Station[]
      results: Station[]
      resultsTitle: string
      songs: Song[]
      lyrics: string | null
      note: string
      lang: Lang
      focusUntil: number
      isPaneOpen: boolean
      isLoaded: boolean
    }
  }
}
