FROM node:20-alpine

# Playwright deps
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
RUN npm i --omit=dev || npm i --legacy-peer-deps || npm i
COPY . .

# Playwright config (uses system chromium)
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin

CMD ["node","src/run.js"]
