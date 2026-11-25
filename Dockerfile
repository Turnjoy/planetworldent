# Workerd's Linux runtime requires glibc, so use Debian slim rather than musl Alpine.
FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb AS runner
ENV NODE_ENV=production \
    HOME=/tmp \
    WRANGLER_SEND_METRICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && mkdir -p /app/node_modules/.mf \
    && chown -R node:node /app/node_modules/.mf
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/functions ./functions
USER node
EXPOSE 8788
CMD ["npm", "run", "pages:dev"]
