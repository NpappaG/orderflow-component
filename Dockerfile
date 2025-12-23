# Multi-stage build for Bun + Next.js

FROM oven/bun:1.2 AS deps
WORKDIR /app

# Copy package manifest files
COPY package.json bun.lock /app/

# Install production and dev dependencies (Next.js needs dev deps at build time)
RUN bun install

#################################################################
FROM oven/bun:1.2 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY . /app

# Accept build arguments
RUN bun run build

#################################################################
FROM oven/bun:1.2 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy built output and dependencies
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/public /app/public
COPY package.json bun.lock /app/

EXPOSE 3000

CMD ["bun", "run", "start"]
