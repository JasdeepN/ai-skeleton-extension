#!/usr/bin/env bash
# Run uvx with a clean Python environment to avoid user/site packages
# that can conflict with uv-managed tools (e.g., pydantic_core errors).
# Usage: scripts/uvx-clean.sh mcp-server-git --help
#        scripts/uvx-clean.sh mcp-server-git -r /path/to/repo
#        scripts/uvx-clean.sh mcp-server-fetch --help
set -euo pipefail
unset PYTHONPATH
export PYTHONNOUSERSITE=1
exec uvx "$@"
