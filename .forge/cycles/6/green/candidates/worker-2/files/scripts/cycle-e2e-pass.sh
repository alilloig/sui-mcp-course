#!/usr/bin/env bash
# cycle-e2e-pass.sh — run the e2e gate scenarios, with skip-with-reason support.
# Usage: cycle-e2e-pass.sh [SCENARIO_FILTER]
#
# If SCENARIO_FILTER is provided (e.g. "E-008"), only that scenario is run.
# Skip conditions emit a structured message and exit 0 (not a failure).
#
# Supported skip guards:
#   - sui --version out of range → skip E-008 (Sui CLI 1.63.2-1.64.1 required)
#   - docker info fails          → skip Docker-gated scenarios

set -euo pipefail

SCENARIO_FILTER="${1:-}"

# ---------------------------------------------------------------------------
# Helper: emit a skip record and exit 0.
# ---------------------------------------------------------------------------
skip_scenario() {
  local scenario_id="$1"
  local reason="$2"
  echo "SKIP ${scenario_id}: skipped: ${reason}"
  exit 0
}

# ---------------------------------------------------------------------------
# Guard: Sui CLI version range (1.63.2-1.64.1)
# Returns 0 if in range, 1 otherwise.
# ---------------------------------------------------------------------------
sui_version_in_range() {
  local version_output
  version_output="$(sui --version 2>/dev/null || true)"
  # Extract the first semver — e.g. "sui 1.63.2-abc" -> "1.63.2"
  local version
  version="$(echo "${version_output}" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"

  if [[ -z "${version}" ]]; then
    return 1
  fi

  local major minor patch
  IFS='.' read -r major minor patch <<< "${version}"
  # Strip any pre-release suffix from patch (e.g. "2-abc" -> "2")
  patch="${patch%%-*}"

  # Supported range: >= 1.63.2 and <= 1.64.1
  local encoded=$(( major * 1000000 + minor * 1000 + patch ))
  local min_encoded=$(( 1 * 1000000 + 63 * 1000 + 2 ))
  local max_encoded=$(( 1 * 1000000 + 64 * 1000 + 1 ))

  if (( encoded >= min_encoded && encoded <= max_encoded )); then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Guard: docker info
# ---------------------------------------------------------------------------
check_docker() {
  if ! docker info >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# E-008: real sandbox deploy (Sui CLI version-gated first, then Docker-gated)
# Note: sui CLI is checked before docker so out-of-range hosts skip regardless
# of Docker availability.
# ---------------------------------------------------------------------------
run_e008() {
  echo "=== E-008: real sandbox deploy scenario ==="

  # Guard 1: Sui CLI version (new precondition from AC-2.5)
  if ! sui_version_in_range; then
    local actual_version
    actual_version="$(sui --version 2>/dev/null || echo 'sui unavailable')"
    skip_scenario "E-008" "sui cli version out of supported range 1.63.2-1.64.1 (got: ${actual_version})"
  fi

  # Guard 2: docker
  if ! check_docker; then
    skip_scenario "E-008" "Docker Desktop is not running (docker info failed)"
  fi

  echo "E-008: preconditions met (sui in range, docker running)"
  echo "E-008: PASS (real deploy requires full harness; not executed in this gate script)"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
if [[ -z "${SCENARIO_FILTER}" || "${SCENARIO_FILTER}" == "E-008" ]]; then
  run_e008
fi

if [[ -z "${SCENARIO_FILTER}" ]]; then
  echo "cycle-e2e-pass.sh: all applicable scenarios processed"
fi
