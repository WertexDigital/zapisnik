#!/bin/zsh
# Vydá novou verzi: ./scripts/release.sh 2.0.1
# Zvýší číslo verze, uloží změny, vytvoří značku a pošle ji na GitHub.
# GitHub Actions pak sestaví Mac i Windows verzi a nainstalované aplikace se samy aktualizují.
set -e
cd "$(dirname "$0")/.."
V="$1"
if [[ -z "$V" || ! "$V" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]]; then
  echo "Použití: ./scripts/release.sh 2.0.1"; exit 1
fi
if git rev-parse "v$V" >/dev/null 2>&1; then echo "Verze v$V už existuje."; exit 1; fi
python3 - "$V" <<'PY'
import json, re, sys
v = sys.argv[1]
for p in ["package.json", "src-tauri/tauri.conf.json"]:
    d = json.load(open(p, encoding="utf-8")); d["version"] = v
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
c = open("src-tauri/Cargo.toml", encoding="utf-8").read()
c = re.sub(r'(?m)^version = "[^"]+"', f'version = "{v}"', c, count=1)
open("src-tauri/Cargo.toml", "w", encoding="utf-8").write(c)
PY
git add -A
git commit -m "Verze $V"
git tag "v$V"
git push origin HEAD "v$V"
echo "Hotovo – sestavení sleduj na: https://github.com/WertexDigital/zapisnik/actions"
