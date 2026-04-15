ARG NODE_VERSION=24
ARG PNPM_VERSION=10

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && \
    apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build-placeholder pnpm prisma generate && \
    pnpm build && \
    pnpm prune --prod

FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@10
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/generated ./src/generated
EXPOSE 3000
CMD ["node", "server.js"]
