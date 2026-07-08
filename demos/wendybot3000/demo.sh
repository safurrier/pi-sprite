#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="${WENDYBOT3000_DEMO_OUT:-/tmp/wendybot3000-sprite}"

cd "$repo_root"

printf '\033[36m# WendyBot3000: source pet → import → use\033[0m\n'
printf '$ cp -R demos/wendybot3000/source-pet %s\n' "$out"
rm -rf "$out"
cp -R demos/wendybot3000/source-pet "$out"
printf '\n'

printf '\033[36m# The pet folder is a normal pi-sprite import\033[0m\n'
printf '$ ls %s\n' "$out"
ls "$out"
printf '\n'

printf '\033[36m# pet.json carries identity, state images, and optional BTW personality\033[0m\n'
printf '$ node -e "..."\n'
node -e 'const fs=require("fs"); const pet=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(JSON.stringify({id:pet.id,name:pet.name,personality:pet.personality,sprites:pet.sprites}, null, 2));' "$out/pet.json"
printf '\n'

printf '\033[36m# In Pi, import and select it\033[0m\n'
cat <<CMDS
/pet import $out
/pet choose wendybot3000
/pet show
/pet status
CMDS
printf '\n'

printf '\033[36m# Then WendyBot3000 participates in the normal pi-sprite workflow\033[0m\n'
cat <<'CMDS'
/context
/btw what should we verify before publishing this package?
/recap
CMDS
