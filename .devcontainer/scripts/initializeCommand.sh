#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".devcontainer/.env"
mkdir -p .devcontainer
touch "$ENV_FILE"

if ! grep -q '^LOCAL_WORKSPACE_ROOT=' "$ENV_FILE"; then
  echo "LOCAL_WORKSPACE_ROOT=${localWorkspaceFolder}" >> "$ENV_FILE"
fi
if ! grep -q '^LOCAL_WORKSPACE_BASENAME=' "$ENV_FILE"; then
  echo "LOCAL_WORKSPACE_BASENAME=${localWorkspaceFolderBasename}" >> "$ENV_FILE"
fi
