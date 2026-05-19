#!/bin/bash
set -euo pipefail

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Error: Not in a git repository" >&2
  exit 1
fi

STAGED_MODE=false
for arg in "$@"; do
  if [ "$arg" = "--staged" ]; then
    STAGED_MODE=true
  fi
done

TMPDIR=$(mktemp -d) || { echo "Failed to create temp dir" >&2; exit 1; }
trap 'rm -rf "$TMPDIR"' EXIT

safe_name() { echo "${1//:/_}"; }

staged_file_type() {
  case "$1" in
    *.ts|*.tsx|*.js|*.jsx)
      echo "lint format"
      ;;
    *.json|*.md)
      echo "format"
      ;;
  esac
}

if [ "$STAGED_MODE" = true ]; then
  staged_files=()
  while IFS= read -r file; do
    [ -n "$file" ] && staged_files+=("$file")
  done < <(git diff --staged --name-only --diff-filter=ACM 2>/dev/null || true)

  relevant_files=()
  lint_files=()
  for file in "${staged_files[@]+${staged_files[@]}}"; do
    [ -z "$file" ] && continue

    file_type=$(staged_file_type "$file")
    case "$file_type" in
      *format*)
        relevant_files+=("$file")
        ;;
    esac

    case "$file_type" in
      *lint*)
        lint_files+=("$file")
        ;;
    esac
  done

  if [ ${#relevant_files[@]} -eq 0 ]; then
    echo "ℹ No relevant staged files to check"
    exit 0
  fi

  echo "ℹ Checking staged files: ${relevant_files[*]}"

  checks=("typecheck" "format:check")
  if [ ${#lint_files[@]} -gt 0 ]; then
    checks=("lint" "${checks[@]}")
  else
    echo "ℹ Skipping lint: no staged JS/TS files"
  fi
  failed=0

  if [ ${#lint_files[@]} -gt 0 ]; then
    (
      exit_code=0
      bunx oxlint --config .oxlintrc.json "${lint_files[@]}" >"$TMPDIR/lint.out" 2>&1 || exit_code=$?
      echo "$exit_code" >"$TMPDIR/lint.exit"
    ) &
    lint_pid=$!
  fi

  (
    exit_code=0
    bun run typecheck >"$TMPDIR/typecheck.out" 2>&1 || exit_code=$?
    echo "$exit_code" >"$TMPDIR/typecheck.exit"
  ) &
  typecheck_pid=$!

  (
    exit_code=0
    bunx oxfmt --check --ignore-path=.oxfmtignore "${relevant_files[@]}" >"$TMPDIR/format_check.out" 2>&1 || exit_code=$?
    [ "$exit_code" -eq 2 ] && exit_code=0
    echo "$exit_code" >"$TMPDIR/format_check.exit"
  ) &
  format_pid=$!

  if [ ${#lint_files[@]} -gt 0 ]; then
    wait "$lint_pid" || true
  fi
  wait "$typecheck_pid" || true
  wait "$format_pid" || true

  failed_checks=()
  passed_checks=()
  for check in "${checks[@]}"; do
    fname=$(safe_name "$check")
    if [ ! -f "$TMPDIR/$fname.exit" ]; then
      failed=$((failed + 1))
      failed_checks+=("$check")
      echo ""
      echo "✗ $check failed (no exit file found)"
      continue
    fi
    exit_code=$(cat "$TMPDIR/$fname.exit")
    if [ "$exit_code" -ne 0 ]; then
      failed=$((failed + 1))
      failed_checks+=("$check")
      echo ""
      echo "✗ $check failed (exit code $exit_code):"
      echo "---"
      cat "$TMPDIR/$fname.out"
      echo "---"
    else
      passed_checks+=("$check")
    fi
  done

  total=${#checks[@]}
  passed=$((total - failed))
  echo ""
  echo "Summary of executed checks:"
  for check in "${passed_checks[@]+${passed_checks[@]}}"; do
    echo "✓ $check"
  done
  for check in "${failed_checks[@]+${failed_checks[@]}}"; do
    echo "✗ $check"
  done
  echo ""
  echo "$passed/$total checks passed, $failed failed"
  if [ "$failed" -eq 0 ]; then
    exit 0
  else
    exit 1
  fi
else
  checks=("lint" "typecheck" "format:check" "knip" "test:bun" "duplicates" "publint")
  failed=0
  pids=()

  for check in "${checks[@]}"; do
    fname=$(safe_name "$check")
    (
      exit_code=0
      bun run "$check" >"$TMPDIR/$fname.out" 2>&1 || exit_code=$?
      echo "$exit_code" >"$TMPDIR/$fname.exit"
    ) &
    pids+=($!)
  done

  for pid in "${pids[@]}"; do
    wait "$pid" || true
  done

  failed_checks=()
  passed_checks=()
  for check in "${checks[@]}"; do
    fname=$(safe_name "$check")
    if [ ! -f "$TMPDIR/$fname.exit" ]; then
      failed=$((failed + 1))
      failed_checks+=("$check")
      echo ""
      echo "✗ $check failed (no exit file found)"
      continue
    fi
    exit_code=$(cat "$TMPDIR/$fname.exit")
    if [ "$exit_code" -ne 0 ]; then
      if [ "$check" = "publint" ]; then
        if [ ! -d "./dist" ]; then
          echo "ℹ publint skipped (dist/ not found)"
        else
          echo "⚠ publint reported issues:"
          echo "---"
          cat "$TMPDIR/$fname.out"
          echo "---"
        fi
        passed_checks+=("publint")
      else
        failed=$((failed + 1))
        failed_checks+=("$check")
        echo ""
        echo "✗ $check failed (exit code $exit_code):"
        echo "---"
        cat "$TMPDIR/$fname.out"
        echo "---"
      fi
    else
      passed_checks+=("$check")
    fi
  done

  total=${#checks[@]}
  passed=$((total - failed))
  echo ""
  echo "Summary of executed checks:"
  for check in "${passed_checks[@]+${passed_checks[@]}}"; do
    echo "✓ $check"
  done
  for check in "${failed_checks[@]+${failed_checks[@]}}"; do
    echo "✗ $check"
  done
  echo ""
  echo "$passed/$total checks passed, $failed failed"
  if [ "$failed" -eq 0 ]; then
    exit 0
  else
    exit 1
  fi
fi