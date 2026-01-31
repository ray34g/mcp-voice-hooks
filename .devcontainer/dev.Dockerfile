# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

# ---- OS deps (native addon compile) ----
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git ca-certificates bash curl jq \
    make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@11.8.0