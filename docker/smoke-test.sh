#!/bin/sh
# Smoke test of the console image, as Kubernetes runs it: read-only root, non-root, an upstream API stand-in.
# Usage: docker/smoke-test.sh <image>
set -eu
image=$1
net=ostrom-web-smoke
fail() { echo "FAIL: $*" >&2; docker logs web >&2 || true; exit 1; }
cleanup() { docker rm -f web api >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker network create "$net" >/dev/null
# whoami echoes the request it receives: path and headers as the server would see them.
docker run -d --name api --network "$net" traefik/whoami:v1.11.0 --port 8080 >/dev/null
docker run -d --name web --network "$net" -p 18080:8080 --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:uid=101,gid=101 --tmpfs /var/run/ostrom:uid=101,gid=101 --tmpfs /etc/nginx/conf.d:uid=101,gid=101 \
  -e OSTROM_API_UPSTREAM=http://api:8080 -e OSTROM_API_URL=https://api.example.com -e 'OSTROM_APP_URL=https://app.example.com/"x' \
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
echo "$cfg" | grep -q '^window.__OSTROM_CONFIG__={"OSTROM_API_URL":"https://api.example.com","OSTROM_APP_URL":"https://app.example.com/\\"x"};$' \
  || fail "config.js: $cfg"
for path in / /config.js /some/route; do
  curl -fsSI "http://127.0.0.1:18080$path" | grep -qi '^x-frame-options: DENY' || fail "security headers on $path"
done
if curl -fsS -o /dev/null http://127.0.0.1:18080/assets/missing.js; then fail "missing asset must be 404"; fi
if docker exec web sh -c 'ls /usr/share/nginx/html/assets/*.map' >/dev/null 2>&1; then fail "source maps shipped"; fi
echo "web image smoke test: ok"
