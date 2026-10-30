#!/bin/sh
# Writes /var/run/ostrom/config.js: window.__OSTROM_CONFIG__ from the public OSTROM_* settings (never secrets).
# Writes /var/run/ostrom/csp.conf: the one origin the Content-Security-Policy adds to connect-src (audit S2-09), the
# PostHog origin when analytics are on (a key is set), nothing otherwise.
set -eu
out=/var/run/ostrom/config.js
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
{
  printf 'window.__OSTROM_CONFIG__={'
  sep=''
  for name in OSTROM_API_URL OSTROM_APP_URL OSTROM_SITE_URL OSTROM_POSTHOG_HOST OSTROM_POSTHOG_API_KEY OSTROM_PRIVACY_URL; do
    eval "value=\${$name:-}"
    if [ -n "$value" ]; then
      printf '%s"%s":"%s"' "$sep" "$name" "$(json_escape "$value")"
      sep=','
    fi
  done
  printf '};\n'
} > "$out"

# The console sends analytics to OSTROM_POSTHOG_HOST (default: PostHog Cloud EU, src/shared/analytics/config.ts).
# Only an http(s) origin goes into the header; anything else stops the start rather than weaken or break the policy.
connect_extra=''
if [ -n "${OSTROM_POSTHOG_API_KEY:-}" ]; then
  host=$(printf '%s' "${OSTROM_POSTHOG_HOST:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  [ -n "$host" ] || host=https://eu.i.posthog.com
  connect_extra=$(printf '%s\n' "$host" | sed -n -E 's#^(https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?)(/.*)?$#\1#p')
  if [ -z "$connect_extra" ] || [ "$(printf '%s\n' "$host" | wc -l)" -ne 1 ]; then
    echo "40-ostrom-config.sh: OSTROM_POSTHOG_HOST must be an http(s) URL, got an invalid value" >&2
    exit 1
  fi
fi
printf 'map $host $ostrom_csp_connect_extra {\n    default "%s";\n}\n' "$connect_extra" > /var/run/ostrom/csp.conf
