#!/usr/bin/env bash
# Install (or update) the mods into the Herdr app, merge their keys and seed the config.
#   HERDR_APP_HOME   the app's folder (default ~/.config/herdr-app)
#   FINGERS_NATIVE_CONFIG   the config file (default ~/.config/herdr-fingers-native/config.json)
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
config=${FINGERS_NATIVE_CONFIG:-$HOME/.config/herdr-fingers-native/config.json}
stage=$HOME/.cache/herdr-fingers-native/stage

[[ -d $app/mods ]] || { echo "No Herdr app folder at $app (start the app once, or set HERDR_APP_HOME)" >&2; exit 1; }

for src in "$repo"/mods/*/; do
  name=$(basename "$src")
  dst=$app/mods/$name
  if [[ -d $dst ]]; then
    # Update in place: the app hot-reloads each copy.
    rsync -a --delete --exclude jsconfig.json --exclude "*.d.ts" --exclude python3 "$src" "$dst/"
    echo "updated  $dst"
  else
    # New: build it whole beside the app, then move it in with one rename. The app docks a mod
    # it sees without mod.json ("place": "none") into the shown layout.
    mkdir -p "$stage"
    tmp=$(mktemp -d "$stage/$name.XXXXXX")
    rsync -a "$src" "$tmp/"
    mv "$tmp" "$dst"
    echo "added    $dst"
  fi
done

# The Python core's interpreter: $FINGERS_PYTHON, else the first of these that exists. Apple's
# /usr/bin/python3 (3.9) is the fallback: it imports re/json/subprocess ~5x slower.
py=${FINGERS_PYTHON:-}
for c in /opt/homebrew/bin/python3 "$(command -v mise >/dev/null && mise which python3 2>/dev/null)" /usr/bin/python3; do
  [[ -z $py && -n $c && -x $c ]] && py=$c
done
ln -sfn "$py" "$app/mods/fingers-native/python3"
echo "python   $py ($("$py" -c 'import sys; print("%d.%d" % sys.version_info[:2])'))"

# Keys: add ours; never replace a key bound to something else.
/usr/bin/python3 -I - "$app/keys.json" "$repo/keys.json" <<'EOF'
import json, sys
path, ours = sys.argv[1], json.load(open(sys.argv[2]))
try:
    keys = json.load(open(path))
except FileNotFoundError:
    keys = {}
changed = False
for section, binds in ours.items():
    have = keys.setdefault(section, {})
    for key, action in binds.items():
        if have.get(key) == action:
            continue
        if key in have:
            print(f"skipped  {key}: already bound to {have[key]!r} (bind {action!r} yourself)")
            continue
        have[key] = action
        changed = True
        print(f"bound    {key} -> {action}")
if changed:
    with open(path, "w") as f:
        json.dump(keys, f, indent=2, ensure_ascii=False)
        f.write("\n")
EOF

if [[ ! -f $config ]]; then
  mkdir -p "$(dirname "$config")"
  printf '{\n  "hints": "alphabet",\n  "action": "open",\n  "patterns": {}\n}\n' >"$config"
  echo "config   $config (see config.example.json)"
fi

if command -v herdr-app >/dev/null; then
  for src in "$repo"/mods/*/; do herdr-app check "$app/mods/$(basename "$src")"; done
fi
