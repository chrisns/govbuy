#!/usr/bin/env bash
# Release gate: block a release if the golden eval regresses below the pass floor.
#
# The eval itself is the Workflow harness scripts/workflows/eval-harness.js — it fires each golden
# question (eval/golden_questions.json) through the LIVE govbuy MCP via `claude -p` and adversarially
# judges every answer with a Sonnet panel. It returns JSON including {pass_rate, gate, failures}.
# That run costs ~50 nested agent invocations, so it is a PRE-RELEASE / CI check, NOT something we run
# on every Cloud Run deploy.
#
# Usage:
#   1. Run the eval harness (via the Workflow tool / your runner) and save its JSON result, e.g.:
#        … > eval-result.json
#   2. Gate on it:
#        ./scripts/release-gate.sh eval-result.json            # fails (exit 1) if gate=false
#        GOVBUY_EVAL_FLOOR=75 ./scripts/release-gate.sh eval-result.json
#
# The floor defaults to 70 (matches the harness PASS_FLOOR); override with GOVBUY_EVAL_FLOOR.
set -euo pipefail

RESULT="${1:-}"
FLOOR="${GOVBUY_EVAL_FLOOR:-70}"

if [ -z "$RESULT" ] || [ ! -f "$RESULT" ]; then
  echo "release-gate: need a path to the eval result JSON (from scripts/workflows/eval-harness.js)." >&2
  echo "  e.g. ./scripts/release-gate.sh eval-result.json" >&2
  exit 2
fi

# Pull pass_rate + gate from the result (jq if present, else node).
if command -v jq >/dev/null 2>&1; then
  PASS_RATE=$(jq -r '.pass_rate // .result.pass_rate // empty' "$RESULT")
  PASSED=$(jq -r '.passed // .result.passed // empty' "$RESULT")
  TOTAL=$(jq -r '.total // .result.total // empty' "$RESULT")
else
  PASS_RATE=$(node -e 'const r=require(process.argv[1]);const o=r.result||r;console.log(o.pass_rate??"")' "$RESULT")
  PASSED=$(node -e 'const r=require(process.argv[1]);const o=r.result||r;console.log(o.passed??"")' "$RESULT")
  TOTAL=$(node -e 'const r=require(process.argv[1]);const o=r.result||r;console.log(o.total??"")' "$RESULT")
fi

if [ -z "$PASS_RATE" ]; then
  echo "release-gate: could not read pass_rate from $RESULT" >&2
  exit 2
fi

echo "release-gate: ${PASSED:-?}/${TOTAL:-?} golden questions passed (${PASS_RATE}%); floor ${FLOOR}%"
if [ "$PASS_RATE" -lt "$FLOOR" ]; then
  echo "❌ GATE FAILED — pass rate ${PASS_RATE}% is below the ${FLOOR}% floor. Block the release." >&2
  if command -v jq >/dev/null 2>&1; then
    echo "Failures:" >&2
    jq -r '(.failures // .result.failures // [])[] | "  - \(.q)\n      ↳ \(.issues)"' "$RESULT" >&2 || true
  fi
  exit 1
fi
echo "✅ GATE PASSED — release may proceed."
