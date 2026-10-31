# syntax=docker/dockerfile:1
# Build context: repository root (pnpm workspace + lockfile).

FROM node:24.22.1-alpine AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first so the dependency layer is cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@auth-app/server..."
COPY shared/ shared/
COPY server/ server/
RUN pnpm --filter @auth-app/shared build \
 && pnpm --filter @auth-app/server build
# Production dependencies + dist only (devDependencies such as typescript are left out).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @auth-app/server deploy --prod /out

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
