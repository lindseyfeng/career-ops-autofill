#!/bin/sh
# Installs the two LaunchAgents (local server always on; morning prep at login + 08:00).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"; CLAUDE_DIR="$(dirname "$(command -v claude)")"
P="$(dirname "$NODE"):$CLAUDE_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"
[ -f "$DIR/facts.md" ] || { cp "$DIR/facts.example.md" "$DIR/facts.md"; echo "created facts.md: fill it in"; }
(cd "$DIR" && npm install --silent)
for n in server morning; do
  dst="$HOME/Library/LaunchAgents/com.career-ops.$n.plist"
  sed -e "s#__NODE__#$NODE#g" -e "s#__DIR__#$DIR#g" -e "s#__PATH__#$P#g" "$DIR/launchd/$n.plist.tmpl" > "$dst"
  plutil -lint "$dst" >/dev/null
  launchctl bootout "gui/$(id -u)" "$dst" 2>/dev/null || true
done
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.career-ops.server.plist"
echo "server running on 127.0.0.1:47821. Morning job runs at next login / 08:00 (or: node morning.mjs --force)."
