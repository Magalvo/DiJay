FROM node:24.18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional deps are the native voice/STT packages; the lean image excludes them and the
# build skips src/infrastructure/voice, so they are never required here.
RUN npm ci --omit=optional
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24.18-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
CMD ["node", "dist/main.js"]
