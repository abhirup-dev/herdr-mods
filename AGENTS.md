# Agent notes

Small Herdr desktop app mods. Each top-level folder is one shareable mod, laid out the way
`~/.config/herdr-app/AGENTS.md` ("Layouts and mods other people made") asks: `mods/<name>/`,
an optional `keys.json`, a `RECIPE.md` and a `preview.png`. `scripts/install.sh` installs every
folder's `mods/*` and merges every `keys.json`; `scripts/uninstall.sh` undoes both.

- API truth: `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `gpui-kit.d.ts` (rewritten by the app
  on every start). Read them before changing mod code; don't work from memory.
- Edit here, never in `~/.config/herdr-app/mods/` directly; `make install` copies over.
- Loop: `make test` → `make install` → `herdr-app status` (live errors) → trigger with
  `herdr-app do mod.open '{"name":"<mod>"}'` → `herdr-app shot` and look at it.
- `herdr-app check` runs a mod for real: anything with side effects (layout.set, setShared)
  skips them when `checking()` is true.
- A new mod gets its own folder: `<folder>/mods/<name>/`, `keys.json` if it binds keys,
  `RECIPE.md` (written from the real files, in the order the app's AGENTS.md gives) and
  `preview.png`. Add it to the table in `README.md`.
- Update a folder's `RECIPE.md` when its behaviour or look changes.
- Fingers: keep `fingers.py` standard-library only and runnable with `/usr/bin/python3 -I`; new
  matching or config logic gets a test in `fingers/tests/test_fingers.py`, picker filtering in
  `fingers/tests/fuzzy.test.mjs`; `fingers/CHANGELOG.md` gets an entry per release.
