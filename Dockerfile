FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# unzip: server/docx.mjs shells out to it for DOCX import.
# Tectonic (LaTeX -> PDF): pinned static binary matching the image arch.
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip && \
    case "${TARGETARCH}" in \
      arm64) TECTONIC_ARCH="aarch64-unknown-linux-musl" ;; \
      amd64|*) TECTONIC_ARCH="x86_64-unknown-linux-musl" ;; \
    esac && \
    curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-${TECTONIC_ARCH}.tar.gz" \
      -o /tmp/tectonic.tar.gz && \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin && \
    rm /tmp/tectonic.tar.gz && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY server ./server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5186
# Required at runtime: comma-separated hostnames the app is reached by, e.g.
# ALLOWED_HOSTS=resume.example.com,203.0.113.7 — the server refuses to start
# without it when bound beyond loopback. Loopback names are always allowed.

EXPOSE 5186
CMD ["node", "server.mjs"]
