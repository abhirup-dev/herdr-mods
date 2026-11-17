#!/usr/bin/env bash
# Remove the mods from the Herdr app (to the Trash) and unbind their keys. The config stays.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}

for src in "$repo"/mods/*/; do
  dst=$app/mods/$(basename "$src")
  if [[ -d $dst ]]; then
    mv "$dst" "$HOME/.Trash/$(basename "$src")-$(date +%Y%m%d%H%M%S)"
    echo "removed  $dst (in the Trash)"
  fi
done

/usr/bin/python3 -I - "$app/keys.json" "$repo/keys.json" <<'EOF'
import json, sys
path, ours = sys.argv[1], json.load(open(sys.argv[2]))
try:
    keys = json.load(open(path))
except FileNotFoundError:
    sys.exit()
changed = False
for section, binds in ours.items():
    for key, action in binds.items():
        if keys.get(section, {}).get(key) == action:
            del keys[section][key]
            changed = True
            print(f"unbound  {key}")
if changed:
    with open(path, "w") as f:
        json.dump(keys, f, indent=2, ensure_ascii=False)
        f.write("\n")
EOF
