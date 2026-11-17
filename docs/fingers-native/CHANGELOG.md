# Changelog

## [Unreleased]

### Added

- **Other machines.** On a terminal in a space on another machine, file candidates are checked
  there (one `hc exec --on`) and files open in that machine's editor (`hc run --on`). Nothing to
  install there.
- **`"editor": "env"`** (the new default): the machine's login-shell `$VISUAL`, then `$EDITOR`,
  then its default editor, then `vi`. A command string still overrides it.

### Changed

- The editor float looks like a pane (the layout's border and radius, a pane-style header) and
  the pane header's icons: dock right, dock below, dock and zoom, close. Docked, the app's grip
  moves it anywhere in the tab.

### Fixed

- Enter on a file that doesn't exist (a deleted or not-yet-written path) copied it; with an
  `editor` set it now opens there: absolute or `~` paths as written, relative ones under the
  terminal's folder.

- Picker: moving the selection past the visible rows now scrolls the list (a virtual list with
  a scroll handle); `ctrl-j` / `ctrl-k` move too. Rows are one line (no source-line preview), and
  the popup keeps its height while you filter, which left stale rows on screen.

- Opening a file from the picker started the editor with no window (the launcher closed before
  opening it).
- The float's editor drew at the core's default 200x120 and broke when resized; it now starts
  once the window has sized its terminal.

## [0.3.0] - 2026-10-31

### Added

- **Open files in your editor** (`editor`, e.g. `"nvim +{line} {path}"`), at the line, as a
  floating window you can drag and dock as a pane or tab (`open_in: "float"`), a split beside the
  source (`"split"`, `split: right|down`) or a new tab (`"tab"`). New mod `fingers-native-editor`.
- **Files with a line number** (`zshrc:211`, `Brewfile:14`) are hinted, and loose `word/word` or
  `name.ext` candidates are kept when they exist under the terminal's folder or git root.
  Existing files are underlined.

### Changed

- **`make install` links the fastest Python** (Homebrew's, else mise's, else Apple's 3.9) for the
  core: key-to-hints drops from ~125 ms to ~70 ms median, the picker from ~125 ms to ~50 ms.
- `hc get` and `hc read` run in parallel.

## [0.2.0] - 2026-10-31

### Changed

- **Patterns are the herdr-fingers TUI set as finalized in dotfiles.** `file` (anchored or with
  an extension), `ip`, `uuid`, `sha`, `url` (now also `git@`, `ssh://`, `file:///`),
  `kubernetes-pod`, `git-status`, `git-status-branch`, `diff`; `(?P<match>…)` groups narrow a
  match. Dropped as false positives: word/word paths (`open/copy/paste`, `48k/500k`), bare
  numbers and `#issue` (add them back under `patterns`).
- **Overlaps resolve as in herdr-fingers:** the leftmost match wins, pattern order breaks ties.

## [0.1.0] - 2026-10-31

### Added

- **Hints mode** (`cmd-shift-f`): the focused pane redrawn in place with hints on URLs, paths
  (with `:line:col`), files, UUIDs, git hashes, IPs, issue numbers and long numbers. Plain hint
  opens, Ctrl copies, Shift pastes; Tab cycles the action.
- **Picker** (`cmd-shift-o`): a native popup with every match and its source line, fuzzy
  filter, keyboard and mouse.
- **Config** (`~/.config/herdr-fingers-native/config.json`): alphabet or numeric hints, a custom
  alphabet, the default action, and custom or disabled patterns.
- `make install` / `make uninstall` / `make test`.
