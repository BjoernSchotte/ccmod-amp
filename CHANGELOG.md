# Changelog

All notable changes to ccmod-amp. Versions are `YYYY.M.N` (N counts releases within the month).

## 2026.10.2

### Fixes

- **radio:** the tool reads its arguments off the event, thanks @DcsPeterDickten (#1) (1b6e3f3)

### Docs

- link the install line to the latest release (ff2117e)

## 2026.10.1

First release: internet radio inside Claude Code, driven by [cliamp](https://github.com/bjarneo/cliamp).

### Highlights

- **Sidebar** (`/cliamp`): now-playing card with a live 4-row equalizer, transport and volume, one key per control
- **Mini player** above the prompt while the sidebar is closed; click it or press `o` to reopen the sidebar
- **Favorites** (`l`), your last picked stations, and cliamp's channels with live listener counts
- **Search** the Radio Browser directory (`f`) and **discover** trending, nearby and tagged stations; a picked result joins your stations
- **Song log** with hearts (`m`), `/cliamp log`, `/cliamp now` copies the song, lyrics (`y`)
- **Focus mode** (`/cliamp focus 25`) with countdown and fade-out, and **moods** (`/cliamp mood debug`)
- **A `radio` tool** so Claude can tell you what's playing and change the station
- **English and German**, following Claude Code's `language` setting, switchable with `t`
- **Volume ducking** on permission prompts and at turn end is available, **off by default**

### Breaking changes

- volume ducking is opt-in and off by default (3917805)

### Features

- cliamp radio mod for Claude Code (6bea126)

### Build & CI

- CalVer release script and changelog, as in agentglass (527a754)

### Docs

- rename screenshots so cached old renders are not shown (c971d9e)
- badges under the title (436d4b3)
- align glyphs to terminal cells in screenshots (e555cd5)
