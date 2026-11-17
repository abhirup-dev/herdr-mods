# herdr-mods

Small mods for the [Herdr](https://herdr.dev) desktop app. Each folder is one mod: its
`mods/<name>/`, the keys it binds (`keys.json`), a `RECIPE.md` to rebuild it from scratch and a
`preview.png`.

| Folder | What it does | How it's opened |
|---|---|---|
| [`fingers`](fingers/README.md) | [tmux-fingers](https://github.com/Morantron/tmux-fingers) for Herdr: every URL, path, git hash, UUID and IP on a terminal's screen as hints, or in a fuzzy picker; files open in a floating editor | `cmd-shift-f` hints, `cmd-shift-o` picker |
| [`confirm-close`](confirm-close/RECIPE.md) | Asks before closing: "Close pane?" in a small window while that pane's border turns red; "Close tab?" in a dialog while `auto-tabs` outlines the tab | `cmd-w`, `cmd-shift-w` |
| [`pane-equalize`](pane-equalize/RECIPE.md) | When panes in a tab form one straight line, keeps their sizes even as panes are added or closed | place it in a layout; `cmd-alt-e` evens out every split of the focused tab |
| [`pane-actions`](pane-actions/RECIPE.md) | The pane header's split / zoom / close buttons, in the tab bar, for the focused pane | place it in a layout |
| [`auto-tabs`](auto-tabs/RECIPE.md) | The app's tab bar with wider names, each tab named after what's in it | place it in a layout (replaces `tabs`) |

## Install

Needs the Herdr app (0.1.10+) on macOS; fingers also needs herdr-core (`hc`).

```sh
git clone https://github.com/abhirup-dev/herdr-mods
cd herdr-mods
make install    # copies every */mods/* into ~/.config/herdr-app/mods, binds keys where free
```

Run it again after `git pull` to update; the app hot-reloads. `make uninstall` moves the mods to
the Trash and unbinds their keys. `make test` runs the fingers tests.

## Bigger mods, in their own repos

- [herdr-canvas-mod](https://github.com/abhirup-dev/herdr-canvas-mod): Mermaid diagrams pinned beside an agent, and a live Excalidraw canvas.
- [herdr-sessions-mod](https://github.com/abhirup-dev/herdr-sessions-mod): sessions (e.g. personal / work) as groups of spaces, plus the `hs` CLI.
- [herdr-top](https://github.com/abhirup-dev/herdr-top): CPU and memory of each agent's process tree, as a popup.
