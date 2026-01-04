#!/usr/bin/env node
/**
 * Compare benchmark results and detect regressions
 *
 * Usage: node scripts/compare-benchmarks.js --current bench-results.json --baseline baseline/bench-results.json --threshold 10
 *
 * Exit codes:
 *   0 - No regressions detected
 *   1 - Regressions detected above threshold
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--current' && argv[i + 1]) {
      args.current = argv[++i];
    } else if (argv[i] === '--baseline' && argv[i + 1]) {
      args.baseline = argv[++i];
    } else if (argv[i] === '--threshold' && argv[i + 1]) {
      args.threshold = parseFloat(argv[++i]);
    } else if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

function loadResults(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to load ${filePath}: ${err.message}`);
    return null;
  }
}

function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function compare(current, baseline, threshold) {
  const comparison = {
    timestamp: new Date().toISOString(),
    currentCommit: process.env.GITHUB_SHA || 'unknown',
    baselineTimestamp: baseline?.timestamp || 'none',
    threshold,
    regressions: [],
    improvements: [],
    unchanged: [],
    summary: {
      hasRegression: false,
      worstRegression: 0,
      bestImprovement: 0,
    },
  };

  if (!baseline) {
    console.log('No baseline found, skipping comparison');
    comparison.noBaseline = true;
    return comparison;
  }

  const baselineByKey = new Map();
  for (const p of baseline.patterns || []) {
    const key = `${p.fixture}:${p.pattern}`;
    baselineByKey.set(key, p);
  }

  for (const currentPattern of current.patterns || []) {
    const key = `${currentPattern.fixture}:${currentPattern.pattern}`;
    const baselinePattern = baselineByKey.get(key);

    if (!baselinePattern) {
      comparison.unchanged.push({
        pattern: currentPattern.pattern,
        fixture: currentPattern.fixture,
        note: 'New pattern (no baseline)',
      });
      continue;
    }

    const lib = currentPattern.globlin ? 'globlin' : 'glob';
    const currentTime = currentPattern[lib]?.mean || currentPattern.glob.mean;
    const baselineTime = baselinePattern[lib]?.mean || baselinePattern.glob.mean;

    const change = ((currentTime - baselineTime) / baselineTime) * 100;

    const result = {
      pattern: currentPattern.pattern,
      fixture: currentPattern.fixture,
      currentTime,
      baselineTime,
      changePercent: change,
    };

    if (change > threshold) {
      comparison.regressions.push(result);
      comparison.summary.hasRegression = true;
      comparison.summary.worstRegression = Math.max(comparison.summary.worstRegression, change);
    } else if (change < -threshold) {
      comparison.improvements.push(result);
      comparison.summary.bestImprovement = Math.min(comparison.summary.bestImprovement, change);
    } else {
      comparison.unchanged.push(result);
    }
  }

  return comparison;
}

function generateMarkdown(comparison) {
  let md = '## Benchmark Comparison Results\n\n';

  if (comparison.noBaseline) {
    md += '> No baseline found for comparison. This will become the new baseline.\n\n';
    return md;
  }

  md += `**Threshold:** ${comparison.threshold}%\n`;
  md += `**Baseline:** ${comparison.baselineTimestamp}\n\n`;

  if (comparison.summary.hasRegression) {
    md += '### Regressions Detected\n\n';
    md += '| Pattern | Fixture | Baseline | Current | Change |\n';
    md += '|---------|---------|----------|---------|--------|\n';
    for (const r of comparison.regressions) {
      md += `| \`${r.pattern}\` | ${r.fixture} | ${formatTime(r.baselineTime)} | ${formatTime(r.currentTime)} | ${formatPercent(r.changePercent)} |\n`;
    }
    md += '\n';
  } else {
    md += '### No Regressions Detected\n\n';
  }

  if (comparison.improvements.length > 0) {
    md += '### Improvements\n\n';
    md += '| Pattern | Fixture | Baseline | Current | Change |\n';
    md += '|---------|---------|----------|---------|--------|\n';
    for (const r of comparison.improvements) {
      md += `| \`${r.pattern}\` | ${r.fixture} | ${formatTime(r.baselineTime)} | ${formatTime(r.currentTime)} | ${formatPercent(r.changePercent)} |\n`;
    }
    md += '\n';
  }

  md += '### Summary\n\n';
  md += `- Regressions: ${comparison.regressions.length}\n`;
  md += `- Improvements: ${comparison.improvements.length}\n`;
  md += `- Unchanged: ${comparison.unchanged.length}\n`;

  if (comparison.summary.worstRegression > 0) {
    md += `- Worst regression: ${formatPercent(comparison.summary.worstRegression)}\n`;
  }
  if (comparison.summary.bestImprovement < 0) {
    md += `- Best improvement: ${formatPercent(comparison.summary.bestImprovement)}\n`;
  }

  return md;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.current) {
    console.error('Usage: compare-benchmarks.js --current <file> [--baseline <file>] [--threshold <percent>]');
    process.exit(1);
  }

  const threshold = args.threshold || 10;
  const current = loadResults(args.current);

  if (!current) {
    console.error(`Failed to load current results from ${args.current}`);
    process.exit(1);
  }

  const baseline = args.baseline ? loadResults(args.baseline) : null;
  const comparison = compare(current, baseline, threshold);

  console.log('\n' + generateMarkdown(comparison));

  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(comparison, null, 2));
    console.log(`Comparison results written to ${args.output}`);
  }

  const markdownFile = 'bench-comparison.md';
  fs.writeFileSync(markdownFile, generateMarkdown(comparison));
  console.log(`Markdown written to ${markdownFile}`);

  if (process.env.GITHUB_OUTPUT) {
    const outputLines = [
      `regression=${comparison.summary.hasRegression}`,
      `regressions=${comparison.regressions.length}`,
      `improvements=${comparison.improvements.length}`,
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, outputLines.join('\n') + '\n');
  }

  if (comparison.summary.hasRegression) {
    console.error(`\nRegression detected! ${comparison.regressions.length} pattern(s) regressed by more than ${threshold}%`);
    process.exit(1);
  }

  console.log('\nNo regressions detected.');
  process.exit(0);
}

main();
