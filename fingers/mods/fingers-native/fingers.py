#!/usr/bin/python3
"""herdr-fingers-native: tmux-fingers-style hints for the Herdr app.

  fingers.py hints <terminal> <pane>   hint UI; runs in its own terminal shown in place of <pane>
  fingers.py list <terminal>           JSON for the picker mod: {config, cwd, matches}

Config: ~/.config/herdr-fingers-native/config.json (or $FINGERS_NATIVE_CONFIG), see config.example.json.
"""
import itertools, json, os, re, signal, subprocess, sys

HC = os.path.expanduser("~/.local/bin/hc")
APP = os.path.expanduser("~/.local/bin/herdr-app")
CONFIG_PATH = os.environ.get("FINGERS_NATIVE_CONFIG") or os.path.expanduser("~/.config/herdr-fingers-native/config.json")

# The set finalized for the herdr-fingers TUI plugin (dotfiles: config/terminal/herdr/fingers.config.toml),
# regexes from its source (ryanlewis/herdr-fingers, src/domain/patterns.rs). Dropped there as false
# positives: `path` (any word/word, e.g. "open/copy/paste"), `kubernetes` (hints "bindings" in
# "keybindings"), `digit` and `hex` (line numbers, timestamps). A `match` group narrows the match.
# Order matters: when spans overlap, the earlier pattern wins (custom `file` first, as there).
PATTERNS = {
    # Anchored (/, ~/, ./, ../) or ending in an extension, at a word boundary, with :line[:col].
    "file": r"""(?:^|[\s"'`(\[<=,])(?P<match>(?:~|\.{1,2})?/[\w.@~+-]+(?:/[\w.@+-]+)*/?(?::\d+(?::\d+)?)?|[\w.@+-]+(?:/[\w.@+-]+)+\.\w{1,10}(?::\d+(?::\d+)?)?)""",
    # Boundaries added to ip and sha, and sha needs a letter: a timestamp is not a hash.
    "ip": r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
    "uuid": r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    "sha": r"\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,128}\b",
    "url": r"""((https?://|git@|git://|ssh://|ftp://|file:///)[^\s()"']+)""",
    # Deployment-managed pod names ("nginx-deployment-66b6c48dd5-7xb2r"): no vowels, no 0/1/3.
    "kubernetes-pod": r"[a-z][a-z0-9-]*[a-z0-9]-[bcdfghjklmnpqrstvwxz2456789]{5,10}-[bcdfghjklmnpqrstvwxz2456789]{5}",
    "git-status": r"(modified|deleted|deleted by us|new file): +(?P<match>.+)",
    "git-status-branch": r"Your branch is up to date with '(?P<match>.*)'.",
    "diff": r"(---|\+\+\+) [ab]/(?P<match>.*)",
    # Beyond the TUI set. A path with a line number but no extension or anchor
    # ("config/shell/zshrc:211", "brew/Brewfile:14"): the :line says it's a file.
    "file-line": r"""(?:^|[\s"'`(\[<=,])(?P<match>[\w.@+-]+(?:/[\w.@+-]+)+:\d+(?::\d+)?)""",
    # Loose: any word/word or name.ext ("mise.toml"). Kept only when it names a file or folder
    # that exists (VERIFY), so "open/copy/paste" and "example.com" stay out.
    "file-maybe": r"""(?:^|[\s"'`(\[<=,])(?P<match>[\w.@+-]+(?:/[\w.@+-]+)+/?|[\w@+-][\w.@+-]*\.[A-Za-z]\w{0,9}(?::\d+(?::\d+)?)?)""",
}
VERIFY = {"file-maybe"}  # dropped unless they exist
FILE_KINDS = {"file", "file-line", "file-maybe"}  # shown as "file"; underlined when they exist
ALPHABETS = {
    # No c h i j m q: ctrl+those are the terminal's (ctrl-c, backspace, tab, enter) or cancel.
    "alphabet": "asdfgklwertyuopzxvbn",
    "numeric": "1234567890",
}
ACTIONS = ("open", "copy", "paste")
DEFAULTS = {"hints": "alphabet", "alphabet": None, "action": "open", "patterns": {},
            "editor": "env", "open_in": "float", "split": "right"}
OPEN_IN = ("float", "split", "tab")
APP_HOME = os.environ.get("HERDR_APP_HOME") or os.path.expanduser("~/.config/herdr-app")


# ---- config -----------------------------------------------------------------------------------

def load_config(path=CONFIG_PATH):
    """Defaults, overlaid with the user's file. Unknown or invalid values fall back to defaults."""
    cfg = dict(DEFAULTS)
    try:
        with open(path) as f:
            user = json.load(f)
        if isinstance(user, dict):
            cfg.update({k: v for k, v in user.items() if k in DEFAULTS})
    except (OSError, ValueError):
        pass
    if cfg["hints"] not in ALPHABETS:
        cfg["hints"] = "alphabet"
    if cfg["action"] not in ACTIONS:
        cfg["action"] = "open"
    alpha = cfg["alphabet"] if isinstance(cfg["alphabet"], str) else ""
    alpha = "".join(dict.fromkeys(alpha))  # unique, in order
    if len(alpha) < 2 or "q" in alpha:
        alpha = ALPHABETS[cfg["hints"]]
    cfg["alphabet"] = alpha
    if not isinstance(cfg["patterns"], dict):
        cfg["patterns"] = {}
    if not (isinstance(cfg["editor"], str) and cfg["editor"].strip()):
        cfg["editor"] = None  # files open with the system's `open` (this machine only)
    if cfg["open_in"] not in OPEN_IN:
        cfg["open_in"] = "float"
    if cfg["split"] not in ("right", "down"):
        cfg["split"] = "right"
    return cfg


def compile_patterns(overrides):
    """Built-ins, with overrides: {"name": "regex"} adds or replaces, {"name": false} disables."""
    pats = dict(PATTERNS)
    for name, rx in overrides.items():
        if rx is False:
            pats.pop(name, None)
        elif isinstance(rx, str):
            try:
                re.compile(rx)
                pats[name] = rx
            except re.error:
                pass  # a broken user regex is skipped, never fatal
    return [(name, re.compile(rx)) for name, rx in pats.items()]


# ---- matching and hints -----------------------------------------------------------------------

def find_matches(lines, patterns, exists=None):
    """[(row, col, text, kind, found)], left to right. As in herdr-fingers, the match starting
    leftmost wins an overlap, and pattern order breaks a tie at the same column. Spans are whole
    matches; the text is the `match` group when there is one. `exists(text)` checks file kinds:
    VERIFY kinds that don't exist are dropped before overlaps are settled (so they never hide a
    real match); `found` is True/False for file kinds, None for others or without `exists`."""
    out = []
    for y, line in enumerate(lines):
        found = []
        for rank, (kind, rx) in enumerate(patterns):
            for m in rx.finditer(line):
                g = "match" if "match" in rx.groupindex and m.group("match") is not None else 0
                text = m.group(g).rstrip(".,;:")  # sentence punctuation
                if not text:
                    continue
                ok = bool(exists(text)) if exists and kind in FILE_KINDS else None
                if kind in VERIFY and not ok:
                    continue
                found.append((m.start(), rank, m.end(), m.start(g), text, "file" if kind in FILE_KINDS else kind, ok))
        end = -1
        for start, _, stop, col, text, kind, ok in sorted(found):
            if start >= end:
                out.append((y, col, text, kind, ok))
                end = stop
    return out


def make_hints(n, alphabet):
    """n hints of equal width (so none is a prefix of another), shortest width that fits."""
    if n <= 0:
        return []
    width = 1
    while len(alphabet) ** width < n:
        width += 1
    return ["".join(p) for p in itertools.islice(itertools.product(alphabet, repeat=width), n)]


def assign_hints(matches, alphabet):
    """{text: hint}; the same text shares a hint; text nearest the bottom gets the first hints."""
    uniq = list(dict.fromkeys(m[2] for m in reversed(matches)))
    return dict(zip(uniq, make_hints(len(uniq), alphabet)))


# ---- herdr-core -------------------------------------------------------------------------------

def read_terminal(terminal):
    """(lines, cwd) of a terminal's visible screen. Plain text: herdr-core drops colours.
    Both hc calls run at once."""
    get, read = (subprocess.Popen([HC, cmd, terminal, "--json"], stdout=subprocess.PIPE, text=True) for cmd in ("get", "read"))
    try:
        info, screen = json.loads(get.communicate()[0] or "{}"), json.loads(read.communicate()[0] or "{}")
    except ValueError:
        info, screen = {}, {}
    cwd = (info.get("foreground") or {}).get("cwd") or info.get("cwd") or os.path.expanduser("~")
    return screen.get("text", "").replace("\u200b", "").split("\n"), cwd


def git_root(path):
    while path and path != "/":
        if os.path.exists(os.path.join(path, ".git")):
            return path
        path = os.path.dirname(path)
    return None


def machine_of(terminal):
    """The machine a terminal runs on: `vps` for `vps/t7`, None for this one."""
    return terminal.split("/", 1)[0] if "/" in terminal else None


def strip_line(text):
    return re.sub(r":\d+(?:[:-]\d+)?$", "", text)


def file_finder(cwd):
    """resolve(text) -> an existing path or None, on this machine: text (`:line[:col]` dropped,
    ~ expanded) under the terminal's folder, then its git root. Cached; a few stat calls each.
    resolve.isdir(path) and resolve.home go with it, as remote_finder's do."""
    roots = [r for r in dict.fromkeys([cwd, git_root(cwd)]) if r]
    cache = {}

    def resolve(text):
        if text not in cache:
            rel = os.path.expanduser(strip_line(text))
            cache[text] = next((p for p in (os.path.join(r, rel) for r in roots) if os.path.exists(p)), None)
        return cache[text]

    resolve.isdir, resolve.home = os.path.isdir, os.path.expanduser("~")
    return resolve


# Runs on the other machine (sh, no Python needed there): prints its $HOME, then `d|f<TAB>p<TAB>path`
# for each p that exists, with file_finder's rules. Arguments: cwd, then the paths.
REMOTE_CHECK = r"""cwd=$1; shift
root=$(cd "$cwd" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
printf '%s\n' "$HOME"
for p; do
  case $p in
    "~"|"~/"*) c="$HOME${p#"~"}" ;;
    /*) c=$p ;;
    *) c="$cwd/$p"; [ -e "$c" ] || [ -z "$root" ] || c="$root/$p" ;;
  esac
  if [ -d "$c" ]; then printf 'd\t%s\t%s\n' "$p" "$c"; elif [ -e "$c" ]; then printf 'f\t%s\t%s\n' "$p" "$c"; fi
done"""


def remote_finder(machine, cwd, texts):
    """file_finder for another machine: every candidate in `texts` checked there in one
    `hc exec --on`. Unreachable: nothing resolves (loose candidates drop)."""
    rels = sorted({strip_line(t) for t in texts})
    found, dirs, home = {}, set(), None
    try:
        out = subprocess.run([HC, "exec", "--on", machine, "--timeout", "10", "--", "sh", "-c", REMOTE_CHECK, "fingers", cwd, *rels],
                             capture_output=True, text=True, timeout=15).stdout.split("\n")
        home = out[0] or None
        for row in out[1:]:
            kind, _, rest = row.partition("\t")
            rel, _, path = rest.partition("\t")
            if path:
                found[rel] = path
                if kind == "d":
                    dirs.add(path)
    except (OSError, subprocess.SubprocessError):
        pass

    def resolve(text):
        return found.get(strip_line(text))

    resolve.isdir, resolve.home = (lambda path: path in dirs), home
    return resolve


def screen_matches(lines, patterns, terminal, cwd):
    """(matches, resolve): find_matches with file candidates checked on the terminal's own machine."""
    machine = machine_of(terminal)
    if not machine:
        resolve = file_finder(cwd)
    else:
        texts = set()
        find_matches(lines, patterns, texts.add)  # every file candidate, before any is dropped
        resolve = remote_finder(machine, cwd, texts)
    return find_matches(lines, patterns, resolve), resolve


def new_path(text, cwd, home=None):
    """Where a file that doesn't exist (yet) would be, for the editor: absolute or ~ (`home`, that
    machine's) as written, relative under the terminal's folder. `:line[:col]` dropped."""
    path = strip_line(text)
    if path == "~" or path.startswith("~/"):
        path = (home or os.path.expanduser("~")) + path[1:]
    return path if path.startswith("/") else os.path.join(cwd, path) if cwd else None


def split_line(text):
    """(line, col) from a trailing :line, :line:col or :start-end; else (None, None)."""
    m = re.search(r":(\d+)(?::(\d+)|-\d+)?$", text)
    return (int(m.group(1)), int(m.group(2)) if m.group(2) else None) if m else (None, None)


def open_in_editor(path, text, pane, cwd, machine=None):
    """Hand the file to the fingers-native-editor mod, which starts the configured editor (a floating
    window, a split or a tab). A request file, since only a mod can open an overlay."""
    line, col = split_line(text)
    req = {"path": path, "line": line, "col": col, "cwd": cwd, "pane": pane, "machine": machine}
    with open(os.path.join(APP_HOME, "fingers-native-open.json"), "w") as f:
        json.dump(req, f)
    subprocess.run([APP, "do", "mod.open", json.dumps({"name": "fingers-native-editor"})], capture_output=True)


def act(text, mode, resolve, editor=None, new_file=False, machine=None):
    """editor: (pane, cwd) when an editor should open files, else None (system `open`, this machine
    only). new_file: a file match, so the editor opens it even when it doesn't exist. machine: the
    terminal's, when it's another one; the clipboard and the browser are always this one's."""
    path = resolve(text) or (new_path(text, editor[1], resolve.home) if editor and new_file else None)
    folder = bool(path) and resolve.isdir(path)
    if mode == "paste":
        subprocess.run(["pbcopy"], input=text, text=True)
        subprocess.run([APP, "do", "terminal.paste"], capture_output=True)
    elif mode == "open" and text.startswith(("http://", "https://")):
        subprocess.run(["open", text])
    elif mode == "open" and path and editor and not (folder and not machine):  # another machine's folder: the editor
        open_in_editor(path, text, *editor, machine)
    elif mode == "open" and path and not machine and resolve(text):
        subprocess.run(["open", path])
    else:  # copy, or nothing to open
        subprocess.run(["pbcopy"], input=text, text=True)


# ---- commands ---------------------------------------------------------------------------------

def cmd_list(terminal):
    cfg = load_config()
    lines, cwd = read_terminal(terminal)
    matches, resolve = screen_matches(lines, compile_patterns(cfg["patterns"]), terminal, cwd)
    seen, items = set(), []
    for y, x, text, kind, _ in reversed(matches):  # nearest the prompt first, one row per text
        if text in seen:
            continue
        seen.add(text)
        path = resolve(text) if kind == "file" else None
        if kind == "file" and not path and cfg["editor"]:
            path = new_path(text, cwd, resolve.home)  # the editor opens a missing file too (a new buffer)
        items.append({"text": text, "kind": kind, "row": y, "line": lines[y].strip(), "file": path,
                      "dir": bool(path and resolve.isdir(path))})
    json.dump({"config": cfg, "cwd": cwd, "machine": machine_of(terminal), "matches": items}, sys.stdout)


def cmd_hints(terminal, pane):
    import termios, tty

    cfg = load_config()
    lines, cwd = read_terminal(terminal)
    matches, resolve = screen_matches(lines, compile_patterns(cfg["patterns"]), terminal, cwd)
    hint_of = assign_hints(matches, cfg["alphabet"])
    numeric = cfg["alphabet"].isdigit()
    state = {"typed": "", "mode": cfg["action"]}

    def draw(*_):
        cols, rows = os.get_terminal_size()
        out = ["\x1b[H\x1b[2J"]
        for y, line in enumerate(lines[:rows]):
            s, pos = "", 0
            for my, x, text, _, found in matches:
                if my != y or x < pos:
                    continue
                h = hint_of[text]
                s += "\x1b[2m" + line[pos:x] + "\x1b[0m"
                if h.startswith(state["typed"]):
                    under = "4;" if found else ""  # an existing file: underlined
                    s += f"\x1b[1;{under}30;43m" + h + f"\x1b[0;{under}33m" + text[len(h):] + "\x1b[0m"
                else:
                    s += "\x1b[2m" + text + "\x1b[0m"
                pos = x + len(text)
            out.append(s + "\x1b[2m" + line[pos:] + "\x1b[0m" + ("\r\n" if y < rows - 1 else ""))
        badge = f" {state['mode']} · tab: " + ("o/y/p" if numeric else "ctrl copy · shift paste") + " "
        out.append(f"\x1b[1;{max(1, cols - len(badge) + 1)}H\x1b[7m{badge}\x1b[0m")
        sys.stdout.write("".join(out))
        sys.stdout.flush()

    def read_key():
        """(char, mode) for a hint key, ("", None) to cancel, (None, None) for an action switch."""
        c = os.read(sys.stdin.fileno(), 8).decode(errors="ignore")
        if not c or c[0] in "\x1b\x03q":
            return "", None
        ch = c[0]
        if ch == "\t":
            state["mode"] = ACTIONS[(ACTIONS.index(state["mode"]) + 1) % len(ACTIONS)]
            return None, None
        if numeric and ch in "oyp":  # digits can't carry ctrl/shift, so letters pick the action
            state["mode"] = {"o": "open", "y": "copy", "p": "paste"}[ch]
            return None, None
        if "\x01" <= ch <= "\x1a":
            return chr(ord(ch) + 96), "copy"
        if ch.isupper():
            return ch.lower(), "paste"
        return ch, state["mode"]

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    tty.setraw(fd)
    sys.stdout.write("\x1b[?25l")
    signal.signal(signal.SIGWINCH, draw)
    picked = None
    try:
        draw()
        while picked is None and hint_of:
            ch, mode = read_key()
            if ch == "":
                break
            if ch is not None:
                state["typed"] += ch
                text = next((t for t, h in hint_of.items() if h == state["typed"]), None)
                if text:
                    picked = (text, mode)
                elif not any(h.startswith(state["typed"]) for h in hint_of.values()):
                    state["typed"] = ""
            draw()
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        sys.stdout.write("\x1b[?25h")
    # Give the pane back first, so a paste lands in the source terminal.
    subprocess.run([APP, "do", "terminal.show", json.dumps({"pane": pane})], capture_output=True)
    if picked:
        is_file = any(t == picked[0] and k == "file" for _, _, t, k, _ in matches)
        act(picked[0], picked[1], resolve, (pane, cwd) if cfg["editor"] else None, is_file, machine_of(terminal))


def main(argv):
    if len(argv) == 3 and argv[0] == "hints":
        cmd_hints(argv[1], argv[2])
    elif len(argv) == 2 and argv[0] == "list":
        cmd_list(argv[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
