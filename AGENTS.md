# Agent notes

Small Herdr desktop app mods, one folder each under `mods/`. `scripts/install.sh` installs every
one. Fingers (`mods/fingers-native*`) is the biggest: one Python file
(`mods/fingers-native/fingers.py`) owns matching, hints and config for its mods.

- API truth: `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `gpui-kit.d.ts` (rewritten by the app
  on every start). Read them before changing mod code; don't work from memory.
- Edit here, never in `~/.config/herdr-app/mods/` directly; `make install` copies over.
- Loop: `make test` → `make install` → `herdr-app status` (live errors) → trigger with
  `herdr-app do mod.open '{"name":"fingers-native"}'` → `herdr-app shot` and look at it.
- Keep `fingers.py` standard-library only and runnable with `/usr/bin/python3 -I`.
- New matching or config logic gets a test in `tests/test_fingers.py`; picker filtering in
  `tests/fuzzy.test.mjs`.
- `docs/fingers-native/RECIPE.md` is the herdr.dev/mods brief: update it when behaviour or the look changes.
  `docs/fingers-native/CHANGELOG.md` gets an entry per release.
