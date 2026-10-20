# Live TV — production image (Coolify, dockerfile build pack)
# Same pattern as Subscriptly: node:24 on Debian bookworm-slim.
# This app has no database/Prisma and no env-dependent build,
# so the stages are deps -> build -> runner only.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
# curl is required at runtime by Coolify's in-container healthcheck
# (Subscriptly's first deploy was rolled back without it).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Full node_modules from the deps stage so `next start` can run.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD npm run start
