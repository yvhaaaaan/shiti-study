#!/bin/bash
set -uo pipefail
rm -f /run/shiti/tunnel-url
/opt/shiti/current/cloudflared --no-autoupdate tunnel --protocol http2 --ha-connections 1 --url http://127.0.0.1:8080 2>&1 |
while IFS= read -r line; do
  case "$line" in
    *https://*.trycloudflare.com*)
      target=$(printf '%s\n' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -n 1)
      if [ -n "$target" ]; then
        printf '%s\n' "$target" > /run/shiti/tunnel-url.new
        mv -f /run/shiti/tunnel-url.new /run/shiti/tunnel-url
      fi
      ;;
  esac
  printf '%s\n' "$line"
done
