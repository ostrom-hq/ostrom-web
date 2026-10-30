#!/bin/sh
# Writes /var/run/ostrom/config.js: window.__OSTROM_CONFIG__ from the public OSTROM_* settings (never secrets).
set -eu
out=/var/run/ostrom/config.js
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
{
  printf 'window.__OSTROM_CONFIG__={'
  sep=''
  for name in OSTROM_API_URL OSTROM_APP_URL OSTROM_SITE_URL OSTROM_POSTHOG_HOST OSTROM_POSTHOG_API_KEY; do
    eval "value=\${$name:-}"
    if [ -n "$value" ]; then
      printf '%s"%s":"%s"' "$sep" "$name" "$(json_escape "$value")"
      sep=','
    fi
  done
  printf '};\n'
} > "$out"
