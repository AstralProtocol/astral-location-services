#!/usr/bin/env node
/**
 * CLI entry point for E2E tests.
 *
 * Usage:
 *   node e2e/run.mjs --target local
 *   node e2e/run.mjs --target staging
 *   node e2e/run.mjs --target staging --suite compute-distance
 *   node e2e/run.mjs --target https://custom-url.com --suite onchain
 *   node e2e/run.mjs --target staging --suite all
 */
import { createClient } from './lib/api-client.mjs';
import { runAll, loadOnchainSuites, runSuite } from './lib/test-runner.mjs';

const TARGETS = {
  local: 'http://localhost:3000',
  staging: 'https://staging-api.astral.global',
  production: 'https://api.astral.global',
};

function parseArgs(argv) {
  const args = { target: 'local', suite: 'all' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) {
      args.target = argv[++i];
    } else if (argv[i] === '--suite' && argv[i + 1]) {
      args.suite = argv[++i];
    }
  }
  return args;
}

function resolveTarget(target) {
  return TARGETS[target] || target;
}

/** Remote targets need a delay between tests to avoid rate limiting (429). */
function getDelay(target) {
  return target === 'local' ? 0 : 300;
}

function formatResult(result) {
  const icon = result.pass ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
  const time = `${result.duration}ms`.padStart(6);
  let line = ` ${icon} ${result.name.padEnd(40)} ${time}`;
  if (result.error) {
    line += `\n     \x1b[31mError: ${result.error}\x1b[0m`;
  } else if (!result.pass) {
    const failed = result.assertions.filter(a => !a.pass);
    for (const a of failed) {
      line += `\n     \x1b[31m- ${a.message}\x1b[0m`;
    }
  }
  return line;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = resolveTarget(args.target);

  console.log('');
  console.log('\x1b[1mAstral E2E Test Runner\x1b[0m');
  console.log(`Target: ${baseUrl}`);
  console.log(`Suite:  ${args.suite}`);
  console.log('');

  const client = createClient(baseUrl);

  // Onchain suite is separate (requires env vars)
  if (args.suite === 'onchain' || args.suite === 'round-trip') {
    const suites = await loadOnchainSuites(client, {
      privateKey: process.env.PRIVATE_KEY,
      rpcUrl: process.env.RPC_URL,
    });

    const selected = args.suite === 'all'
      ? suites
      : suites.filter(s => s.name === args.suite);

    for (const suite of selected) {
      const result = await runSuite(suite.name, suite.tests, {
        onTestComplete: (r) => console.log(formatResult(r)),
      });
      console.log(`\n  ${result.name}: ${result.passed}/${result.results.length} passed\n`);
    }
    return;
  }

  // Standard suites
  const delayMs = getDelay(args.target);
  if (delayMs > 0) {
    console.log(`Delay:  ${delayMs}ms between tests (rate limit avoidance)`);
    console.log('');
  }

  const result = await runAll(client, {
    suites: args.suite === 'all' ? undefined : [args.suite],
    delayMs,
    onTestComplete: (r) => console.log(formatResult(r)),
    onSuiteComplete: (s) => {
      console.log(`\n  \x1b[1m${s.name}\x1b[0m: ${s.passed}/${s.results.length} passed\n`);
    },
  });

  // Summary
  console.log('\x1b[1m' + '='.repeat(55) + '\x1b[0m');
  console.log(`\x1b[1m  Summary\x1b[0m`);
  console.log(`  Total:  ${result.summary.total}`);
  console.log(`  Passed: \x1b[32m${result.summary.passed}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${result.summary.failed}\x1b[0m`);
  console.log(`  Time:   ${result.summary.duration}ms`);
  console.log('\x1b[1m' + '='.repeat(55) + '\x1b[0m');
  console.log('');

  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err.message);
  process.exit(1);
});
