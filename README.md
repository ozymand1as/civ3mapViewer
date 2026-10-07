# Civ3 / OpenCiv3 Map Viewer

A static, browser-only viewer for **Civilization III** save games and scenarios,
and for **OpenCiv3** JSON saves. Drop a file in and explore the map —
isometric, pan/zoom, with configurable layers and a per-player visibility
selector.

There is **no server, no build step and no dependencies**. It is plain HTML, CSS
and native ES modules, so it can be hosted on GitHub Pages as-is.

## Privacy

**Your files never leave your computer.** Everything — decompression, parsing
and rendering — happens inside your browser. There are no network requests, no
analytics helpers and no CDN scripts.

## Legal

This project is a **parser and renderer**. It ships **no** Civilization III
art, audio, data or executables, and it does not contain any decompiler output.
It is a clean-room implementation written from published format documentation
and from the MIT-licensed [OpenCiv3](https://github.com/C7-Game/OpenCiv3)
`QueryCiv3` reader (used as a reference for the file formats, not copied).

You must supply your own `.sav`, `.biq`, `.bic` or OpenCiv3 `.json` files. The
map is drawn with flat colours and glyphs, not with original Civ3 graphics.

This project is not affiliated with, endorsed by, or associated with Firaxis
Games, Take-Two Interactive, or the OpenCiv3 project.

## Running locally

The app must be served over HTTP (ES modules and Web Workers do not work from
`file://`). Any static server will do:

```bash
# from this directory
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000/>.

## What it supports

| Input | Notes |
|---|---|
| Civ3 `.sav` (Conquests / Complete v1.22) | terrain, rivers, resources, improvements, features, cities (names, size, statuses, buildings), units, and per-civ `ExploredBy` / `VisibleTo` / `VisibleTo2` / `VisibleTo3` visibility. |
| Civ3 `.biq` / `.bic` | scenario maps and rules-only files. Terrain, resources, starting locations and (for scenarios) pre-placed cities. |
| OpenCiv3 `.json` (`SaveGame`) | full model; visibility is approximated by each player's `tileKnowledge`, because OpenCiv3 saves do not persist current unit vision. |

Vanilla/PTW map files are detected and reported, but only the Conquests map
format is fully parsed; the viewer warns instead of guessing.

### Embedded rules and the base game

A Civ3 `.sav` only embeds the rules sections that differ from the base game.
When a section is missing, the viewer falls back to known base-game counts and
the documented terrain/resource key lists so it can still walk the file. Unit
and building **names** then appear generically (e.g. “Unit 42”), because the base
`conquests.biq` cannot legally be shipped. Loading a scenario save whose
embedded rules are complete (most scenarios) shows real names.

## Features

- **Visibility:** god view, a single player (with explored-but-not-visible
  dimming), all-explored, or a 2–3 player comparison tint.
- **Layers:** terrain, tile grid, coordinates, continent tint, rivers, roads,
  railroads, mines, irrigation, fortresses, barricades, airfields, radar towers,
  outposts, resources, goody huts, barbarian camps, pollution/craters/ruins,
  cities, city names, city statuses, units, unit names, starting locations, fog.
  Choices are remembered in `localStorage`.
- **Interaction:** drag to pan, wheel to zoom (cursor-anchored), double-click to
  zoom, `F` to fit, `+`/`-` to zoom, hover tooltips, click to pin a tile, city/
  unit search, minimap navigation, and PNG export of the current view.

## Architecture

```
index.html            # single page
css/app.css
js/
  app.js              # bootstrap and wiring
  state.js            # state + persisted layer/visibility settings
  model.js            # the unified WorldModel every importer produces
  rules.js            # default terrain + player colour palettes
  importer/
    index.js          # file-type detection and dispatch
    blast.js          # PKWARE DCL "implode" decompressor (port of blast.c)
    binreader.js      # little-endian reader + Windows-1252 strings
    civ3file.js       # version detection and section scanning
    sav.js            # Civ3 .sav importer
    biq.js            # Civ3 .biq / .bic importer
    openciv3.js       # OpenCiv3 JSON importer
    defaults.js       # documented fallback rules
  render/             # iso maths, terrain, rivers, overlays, cities, units
  ui/                 # file bar, layers, players, minimap, tooltip
  workers/parse.worker.js
test/                 # node --test suite (synthetic fixtures only)
```

Parsing runs in a Web Worker so large saves never freeze the UI; the resulting
model is posted back as structured-cloneable plain objects.

## Testing

```bash
npm test
```

The suite uses **synthetic fixtures built byte-by-byte** from the documented
formats (and the known-answer vector from `blast.c`), so no real game files are
committed. To cross-check against real data locally, compare a loaded save with
OpenCiv3's own importer (`dotnet test EngineTests`) — keep such files out of the
repository.

## Licences

- This project: MIT (see `LICENSE`).
- PKWARE DCL decompressor: port of Mark Adler's public-domain `blast.c`; the
  C# translation is Apache-2.0 (James Telfer). Notices are reproduced in
  `LICENSE`.
- Player colour palette: OpenCiv3's MIT-licensed “modern” palette.
- Format knowledge: OpenCiv3 `QueryCiv3` (MIT).
