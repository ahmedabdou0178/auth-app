# syntax=docker/dockerfile:1
# Build context: repository root (pnpm workspace + lockfile).

FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@auth-app/client..."
COPY shared/ shared/
COPY client/ client/
# Same-origin API through the nginx proxy below.
ENV VITE_API_URL=/api
RUN pnpm --filter @auth-app/client build

# Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY client/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/client/dist /usr/share/nginx/html
EXPOSE 8080
