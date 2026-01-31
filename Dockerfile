# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /src

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@11.8.0

COPY . .

RUN npm install \
#   && node -e "try{require('rollup/dist/native');process.exit(0)}catch(e){const v=require('rollup/package.json').version;require('child_process').execSync('npm i -D @rollup/rollup-linux-x64-gnu@'+v,{stdio:'inherit'});}" \
  && npm run build \
  && npm pack --silent

FROM node:22-slim AS runtime
WORKDIR /app

COPY --from=build /src/*.tgz /tmp/pkg.tgz
RUN npm install -g /tmp/pkg.tgz --omit=dev \
  && rm -f /tmp/pkg.tgz \
  && npm cache clean --force

ENV NODE_ENV=production
ENV MCP_VOICE_HOOKS_PORT=5111
ENV MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER=false

EXPOSE 5111
ENTRYPOINT ["mcp-voice-hooks"]
