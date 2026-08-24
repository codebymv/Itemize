# Itemize NestJS Backend - Production Dockerfile
# Multi-stage build with Puppeteer/Chrome support for invoice PDF rendering.

# ===========================
# Stage 1: Builder
# ===========================
FROM node:22-slim AS builder

WORKDIR /app

# Chromium is installed system-wide in the production stage; never download it here.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

# ===========================
# Stage 2: Production
# ===========================
FROM node:22-slim AS production

WORKDIR /app

# Install Chrome dependencies and Chrome (for Puppeteer)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    tini \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Runtime assets: compiled app plus the file trees resolved at runtime
# (docs mirror, ported PDF service).
COPY --from=builder /app/dist ./dist
COPY docs ./docs
COPY pdf-service ./pdf-service

RUN mkdir -p uploads/logos uploads/signatures && \
    chown -R nodejs:nodejs uploads

ENV NODE_ENV=production \
    NO_UPDATE_NOTIFIER=1

EXPOSE 3100

USER nodejs

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "--dns-result-order=ipv4first", "dist/main.js"]
