# Medeo API — Cloud Run контейнері (Node 22). Құру: docker build -t medeo-api .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY seed ./seed
COPY assets ./assets
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
