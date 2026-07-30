# MFM Mega Region 2 — Cloud Engine Runner (E2)
# Playwright's image ships Node + Chromium + all browser dependencies.
# NOTE: keep this tag and the "playwright" version in package.json IDENTICAL.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg xvfb pulseaudio pulseaudio-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY runner.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
