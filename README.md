# herdr-mods

Small mods for the [Herdr](https://herdr.dev) desktop app, one folder each under `mods/`.

| Mod | What it does | How it's opened |
|---|---|---|
| [`fingers-native`, `-picker`, `-editor`](docs/fingers-native/README.md) | [tmux-fingers](https://github.com/Morantron/tmux-fingers) for Herdr: every URL, path, git hash, UUID and IP on a terminal's screen as hints, or in a fuzzy picker; files open in a floating editor | `cmd-shift-f` hints, `cmd-shift-o` picker |
| `confirm-pane-close` | Asks "Close pane?" before closing the focused pane | `cmd-w` |
| `confirm-tab-close` | Asks "Close tab?" before closing the focused tab | `cmd-shift-w` |
| `pane-equalize` | When panes in a tab form one straight line, keeps their sizes equal as panes are added or closed | place it in a layout; `cmd-alt-e` evens out every split of the focused tab |
| `pane-actions` | The pane header's split / zoom / close buttons, in the tab bar, for the focused pane | place it in a layout |
| `auto-tabs` | The app's tab bar with wider names; `names.js` names the tabs | place it in a layout (replaces `tabs`) |

## Install

Needs the Herdr app (0.1.10+) on macOS; fingers also needs herdr-core (`hc`).

```sh
git clone https://github.com/abhirup-dev/herdr-mods
cd herdr-mods
make install    # copies mods/* into ~/.config/herdr-app/mods, binds keys.json where free
```

Run it again after `git pull`; the app hot-reloads. `make uninstall` moves the mods to the Trash
and unbinds their keys. `make test` runs the fingers tests.

## Bigger mods, in their own repos

- [herdr-canvas-mod](https://github.com/abhirup-dev/herdr-canvas-mod): Mermaid diagrams pinned beside an agent, and a live Excalidraw canvas.
- [herdr-sessions-mod](https://github.com/abhirup-dev/herdr-sessions-mod): sessions (e.g. personal / work) as groups of spaces, plus the `hs` CLI.
- [herdr-top](https://github.com/abhirup-dev/herdr-top): CPU and memory of each agent's process tree, as a popup.
