#!/bin/bash
#
# Benchmark script for globlin vs glob vs fast-glob
#
# This script compares the performance of:
# - glob (original, for baseline)
# - globlin (this package, when ready)
# - fast-glob (common alternative)
#
# Usage:
#   ./benches/benchmark.sh [small|medium|large]
#
# The script uses real filesystem fixtures created by setup-fixtures.js

set -e
export CDPATH=

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source patterns
source "$SCRIPT_DIR/patterns.sh"

# Fixture size (default: medium)
FIXTURE_SIZE="${1:-medium}"
FIXTURE_DIR="$SCRIPT_DIR/fixtures/$FIXTURE_SIZE"

# Check if fixtures exist
if [ ! -d "$FIXTURE_DIR" ]; then
  echo "Fixture directory not found: $FIXTURE_DIR"
  echo "Run 'node benches/setup-fixtures.js' first to create fixtures."
  exit 1
fi

# Check if node_modules has required packages
if [ ! -d "$PROJECT_DIR/node_modules/glob" ]; then
  echo "Installing dependencies..."
  (cd "$PROJECT_DIR" && npm install)
fi

# Add fast-glob as dev dependency if not present
if [ ! -d "$PROJECT_DIR/node_modules/fast-glob" ]; then
  echo "Installing fast-glob for benchmarks..."
  (cd "$PROJECT_DIR" && npm install --save-dev fast-glob)
fi

echo "============================================"
echo "Globlin Benchmark Suite"
echo "============================================"
echo ""
echo "Fixture: $FIXTURE_SIZE ($FIXTURE_DIR)"
echo "File count: $(find "$FIXTURE_DIR" -type f | wc -l | tr -d ' ') files"
echo ""
echo "Comparing:"
echo "  - glob (baseline)"
echo "  - globlin (this package)"
echo "  - fast-glob"
echo ""
echo "============================================"
echo ""

# Warm up the filesystem cache
echo "Warming up filesystem cache..."
find "$FIXTURE_DIR" -type f > /dev/null 2>&1
echo ""

# Results file for summary (using | as delimiter since patterns may contain commas)
RESULTS_FILE=$(mktemp)
echo "pattern|glob_time|glob_count|globlin_time|globlin_count|fastglob_time|fastglob_count" > "$RESULTS_FILE"

for pattern in "${patterns[@]}"; do
  echo "--- Pattern: '$pattern' ---"
  echo ""
  
  # glob sync
  glob_result=$(node -e "
    const start = Date.now();
    const { globSync } = require('glob');
    const results = globSync('$pattern', { cwd: '$FIXTURE_DIR' });
    const elapsed = Date.now() - start;
    console.log(elapsed + ',' + results.length);
  " 2>&1) || glob_result="0,0"
  
  glob_time=$(echo "$glob_result" | cut -d',' -f1)
  glob_count=$(echo "$glob_result" | cut -d',' -f2)
  printf "  %-20s %6sms  (%s results)\n" "glob sync" "$glob_time" "$glob_count"
  
  # globlin sync (when available)
  globlin_time="N/A"
  globlin_count="N/A"
  if [ -f "$PROJECT_DIR/index.js" ] || ls "$PROJECT_DIR"/*.node 1>/dev/null 2>&1; then
    globlin_result=$(node -e "
      const start = Date.now();
      const { globSync } = require('$PROJECT_DIR');
      const results = globSync('$pattern', { cwd: '$FIXTURE_DIR' });
      const elapsed = Date.now() - start;
      console.log(elapsed + ',' + results.length);
    " 2>&1) || globlin_result="0,0"
    
    globlin_time=$(echo "$globlin_result" | cut -d',' -f1)
    globlin_count=$(echo "$globlin_result" | cut -d',' -f2)
    printf "  %-20s %6sms  (%s results)\n" "globlin sync" "$globlin_time" "$globlin_count"
  else
    printf "  %-20s %s\n" "globlin sync" "(not built yet)"
  fi
  
  # fast-glob sync
  fastglob_result=$(node -e "
    const start = Date.now();
    const fg = require('fast-glob');
    const results = fg.sync('$pattern', { cwd: '$FIXTURE_DIR' });
    const elapsed = Date.now() - start;
    console.log(elapsed + ',' + results.length);
  " 2>&1) || fastglob_result="0,0"
  
  fastglob_time=$(echo "$fastglob_result" | cut -d',' -f1)
  fastglob_count=$(echo "$fastglob_result" | cut -d',' -f2)
  printf "  %-20s %6sms  (%s results)\n" "fast-glob sync" "$fastglob_time" "$fastglob_count"
  
  # Store results for summary
  echo "$pattern|$glob_time|$glob_count|$globlin_time|$globlin_count|$fastglob_time|$fastglob_count" >> "$RESULTS_FILE"
  
  # Print speedup if globlin is available
  if [ "$globlin_time" != "N/A" ] && [ "$globlin_time" -gt 0 ] 2>/dev/null; then
    speedup=$(echo "scale=1; $glob_time / $globlin_time" | bc 2>/dev/null || echo "N/A")
    echo ""
    echo "  Speedup vs glob: ${speedup}x"
  fi
  
  echo ""
done

echo "============================================"
echo "Summary"
echo "============================================"
echo ""

# Print summary table header
printf "%-42s %10s %10s %10s %10s\n" "Pattern" "glob" "globlin" "fast-glob" "Speedup"
printf "%-42s %10s %10s %10s %10s\n" "----------------------------------------" "--------" "--------" "---------" "-------"

# Skip header line and print summary
tail -n +2 "$RESULTS_FILE" | while IFS='|' read -r pattern glob_t glob_c globlin_t globlin_c fastglob_t fastglob_c; do
  # Calculate speedup
  speedup="N/A"
  if [ "$globlin_t" != "N/A" ] && [ "$globlin_t" -gt 0 ] 2>/dev/null; then
    speedup=$(echo "scale=1; $glob_t / $globlin_t" | bc 2>/dev/null || echo "N/A")
    speedup="${speedup}x"
  fi
  
  # Truncate pattern if too long
  if [ ${#pattern} -gt 40 ]; then
    short_pattern="${pattern:0:38}.."
  else
    short_pattern="$pattern"
  fi
  
  # Format times with ms suffix
  glob_display="${glob_t}ms"
  if [ "$globlin_t" = "N/A" ]; then
    globlin_display="N/A"
  else
    globlin_display="${globlin_t}ms"
  fi
  fastglob_display="${fastglob_t}ms"
  
  printf "%-42s %10s %10s %10s %10s\n" "$short_pattern" "$glob_display" "$globlin_display" "$fastglob_display" "$speedup"
done

# Cleanup
rm -f "$RESULTS_FILE"

echo ""
echo "============================================"
echo "Benchmark complete!"
echo "============================================"
echo ""
echo "Note: Results may vary based on filesystem cache and system load."
echo "For accurate results, run multiple times and compare."
