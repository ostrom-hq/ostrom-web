# syntax=docker/dockerfile:1.7
# The console image: the static build behind nginx (unprivileged, read-only root friendly). One image for every
# deployment: /api/ is proxied to the server (same origin, no CORS), runtime settings come from the environment.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && find dist -name '*.map' -delete

FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /var/run/ostrom && chown 101:101 /var/run/ostrom
COPY docker/security-headers.conf /etc/nginx/ostrom/security-headers.conf
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0755 docker/40-ostrom-config.sh /docker-entrypoint.d/40-ostrom-config.sh
COPY --from=build /src/dist /usr/share/nginx/html
USER 101
ENV OSTROM_API_UPSTREAM=http://server:8080 \
    NGINX_ENVSUBST_FILTER=^OSTROM_
EXPOSE 8080
