# Stage 1: install
FROM oven/bun:1.3.11-alpine AS install
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN bun install --frozen-lockfile

# Stage 2: build SPA
FROM install AS build
COPY apps/web apps/web
COPY apps/api apps/api
RUN cd apps/web && bun run build

# Stage 3: production-only deps (strips devDependencies from runtime image)
FROM install AS prod-deps
RUN bun install --production --frozen-lockfile

# Stage 4: runtime
FROM oven/bun:1.3.11-alpine
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/bun.lock ./
COPY --from=prod-deps /app/bunfig.toml ./
COPY --from=prod-deps /app/tsconfig.base.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=prod-deps /app/apps/api/package.json ./apps/api/
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/dist ./apps/web/dist
ENV DATABASE_PATH=/data/tasks.db
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "apps/api/src/index.ts"]
