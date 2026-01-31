# syntax=docker/dockerfile:1
FROM node:22-slim AS dev

# ---- OS deps (dev tooling) ----
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git ca-certificates bash curl jq \
    sudo \
    tree \
    graphviz \
    ripgrep \
    less \
    procps \
  && rm -rf /var/lib/apt/lists/*

# sudoers: allow node user to sudo without password (devcontainer use case)
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node

RUN npm i -g npm@11.8.0

USER node