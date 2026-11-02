#!/bin/sh
# Smoke test of the console image, as Kubernetes runs it: read-only root, non-root, an upstream API stand-in.
# Usage: docker/smoke-test.sh <image>
set -eu
image=$1
net=ostrom-web-smoke
fail() { echo "FAIL: $*" >&2; docker logs web >&2 || true; exit 1; }
cleanup() { docker rm -f web web-bad api >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker network create "$net" >/dev/null
# whoami echoes the request it receives: path and headers as the server would see them.
docker run -d --name api --network "$net" traefik/whoami:v1.11.0 --port 8080 >/dev/null
docker run -d --name web --network "$net" -p 18080:8080 --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:uid=101,gid=101 --tmpfs /var/run/ostrom:uid=101,gid=101 --tmpfs /etc/nginx/conf.d:uid=101,gid=101 \
  -e OSTROM_API_UPSTREAM=http://api:8080 -e OSTROM_API_URL=https://api.example.com -e 'OSTROM_APP_URL=https://app.example.com/"x' \
  -e OSTROM_POSTHOG_HOST=https://ph.example.com:8443/ingest/ -e OSTROM_POSTHOG_API_KEY=phc_smoke \
  "$image" >/dev/null
get() { curl -fsS --retry 20 --retry-all-errors --retry-delay 1 "http://127.0.0.1:18080$1"; }

[ "$(docker inspect -f '{{.Config.User}}' "$image")" = "101" ] || fail "the image does not run as uid 101"
get /healthz | grep -qx ok || fail "/healthz"
get / | grep -q '<div id="root">' || fail "index.html"
get /some/deep/route | grep -q '<div id="root">' || fail "SPA fallback"
get /api/v1/health | grep -q '^GET /api/v1/health HTTP/1.1' || fail "/api/v1/… proxied to the server unchanged"
ws=$(curl -fsS --retry 5 --retry-all-errors -H 'Connection: Upgrade' -H 'Upgrade: websocket' http://127.0.0.1:18080/api/v1/x)
echo "$ws" | grep -qi '^Upgrade: websocket' || fail "Upgrade header not passed: $ws"
echo "$ws" | grep -qi '^Connection: upgrade' || fail "Connection: upgrade not passed: $ws"
cfg=$(get /config.js)
echo "$cfg" | grep -q '^window.__OSTROM_CONFIG__={"OSTROM_API_URL":"https://api.example.com","OSTROM_APP_URL":"https://app.example.com/\\"x","OSTROM_POSTHOG_HOST":"https://ph.example.com:8443/ingest/","OSTROM_POSTHOG_API_KEY":"phc_smoke"};$' \
  || fail "config.js: $cfg"
# S2-09: the same security headers on the page, the runtime settings, a deep route, a script, the API and /healthz.
csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://ph.example.com:8443; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; require-trusted-types-for 'script'"
header() { printf '%s\n' "$1" | tr -d '\r' | sed -n "s/^$2: //Ip"; }
for path in / /config.js /some/route /theme.js /api/v1/health /healthz; do
  h=$(curl -fsSI --retry 5 --retry-all-errors "http://127.0.0.1:18080$path")
  [ "$(header "$h" content-security-policy)" = "$csp" ] || fail "CSP on $path: $(header "$h" content-security-policy)"
  [ "$(header "$h" strict-transport-security)" = 'max-age=63072000; includeSubDomains' ] || fail "HSTS on $path"
  [ "$(header "$h" x-content-type-options)" = nosniff ] || fail "X-Content-Type-Options on $path"
  [ "$(header "$h" referrer-policy)" = strict-origin-when-cross-origin ] || fail "Referrer-Policy on $path"
  [ "$(header "$h" x-frame-options)" = DENY ] || fail "X-Frame-Options on $path"
  [ "$(header "$h" cross-origin-opener-policy)" = same-origin ] || fail "Cross-Origin-Opener-Policy on $path"
  [ "$(header "$h" permissions-policy)" = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' ] \
    || fail "Permissions-Policy on $path"
done
# script-src 'self' holds only if index.html has no inline script: every <script> has a src.
html=$(get /)
[ "$(printf '%s' "$html" | grep -o '<script' | wc -l)" = "$(printf '%s' "$html" | grep -o '<script[^>]* src=' | wc -l)" ] \
  || fail "inline script in index.html: $html"
get /theme.js | grep -q "dataset.theme" || fail "/theme.js"
# A PostHog host that is not an http(s) URL never reaches the header: the container refuses to start.
set +e
bad=$(timeout 30 docker run --rm --name web-bad --network "$net" --read-only --tmpfs /tmp:uid=101,gid=101 \
  --tmpfs /var/run/ostrom:uid=101,gid=101 --tmpfs /etc/nginx/conf.d:uid=101,gid=101 -e OSTROM_API_UPSTREAM=http://api:8080 \
  -e OSTROM_POSTHOG_API_KEY=phc_smoke -e "OSTROM_POSTHOG_HOST=https://x.example.com; script-src *" "$image" 2>&1)
code=$?
set -e
{ [ "$code" -ne 0 ] && [ "$code" -ne 124 ]; } || fail "an invalid OSTROM_POSTHOG_HOST must stop the start (exit $code)"
echo "$bad" | grep -q 'OSTROM_POSTHOG_HOST must be an http(s) URL' || fail "no reason given for the refused start: $bad"
if curl -fsS -o /dev/null http://127.0.0.1:18080/assets/missing.js; then fail "missing asset must be 404"; fi
if docker exec web sh -c 'ls /usr/share/nginx/html/assets/*.map' >/dev/null 2>&1; then fail "source maps shipped"; fi
# A build without VITE_MOCKS ships neither the mock API nor its demo data (audit AUDIT-SECU-WEB-2 B7).
if docker exec web grep -rlqe ml_demo -e '\[MSW\]' /usr/share/nginx/html/assets; then fail "mock API shipped"; fi
echo "web image smoke test: ok"
