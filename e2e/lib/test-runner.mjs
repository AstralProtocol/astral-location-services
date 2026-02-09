/**
 * Test runner / orchestrator.
 * Runs test functions, collects structured results.
 * Shared between CLI and dashboard.
 */

/**
 * Run a single test function.
 * @param {string} name - Test name
 * @param {() => Promise<{pass: boolean, message: string, details?: object}[]>} fn
 *   Test function returning an array of assertion results
 * @returns {Promise<{name: string, pass: boolean, duration: number, assertions: object[], error?: string}>}
 */
export async function runTest(name, fn) {
  const start = performance.now();
  try {
    const assertions = await fn();
    const duration = Math.round(performance.now() - start);
    const pass = assertions.every(a => a.pass);
    return { name, pass, duration, assertions };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    return {
      name,
      pass: false,
      duration,
      assertions: [],
      error: err.message || String(err),
    };
  }
}

/**
 * Run a suite of tests.
 * @param {string} name - Suite name
 * @param {{name: string, fn: () => Promise<object[]>}[]} tests
 * @param {{ onTestComplete?: (result: object) => void, delayMs?: number }} [options]
 * @returns {Promise<{name: string, results: object[], passed: number, failed: number}>}
 */
export async function runSuite(name, tests, options = {}) {
  const results = [];
  const delay = options.delayMs || 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (delay > 0 && i > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    const result = await runTest(test.name, test.fn);
    results.push(result);
    if (options.onTestComplete) {
      options.onTestComplete(result);
    }
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  return { name, results, passed, failed };
}

/**
 * Run all suites.
 * @param {object} client - API client from api-client.mjs
 * @param {{ suites?: string[], onTestComplete?: (result: object) => void, onSuiteComplete?: (suite: object) => void, delayMs?: number }} [options]
 * @returns {Promise<{suites: object[], summary: {total: number, passed: number, failed: number, duration: number}}>}
 */
export async function runAll(client, options = {}) {
  // Dynamically import test suites
  const allSuites = await loadSuites(client);

  const selectedSuites = options.suites
    ? allSuites.filter(s => options.suites.includes(s.name))
    : allSuites;

  const start = performance.now();
  const suiteResults = [];
  const delay = options.delayMs || 0;

  for (let i = 0; i < selectedSuites.length; i++) {
    const suite = selectedSuites[i];
    if (delay > 0 && i > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    const result = await runSuite(suite.name, suite.tests, options);
    suiteResults.push(result);
    if (options.onSuiteComplete) {
      options.onSuiteComplete(result);
    }
  }

  const duration = Math.round(performance.now() - start);
  const total = suiteResults.reduce((sum, s) => sum + s.results.length, 0);
  const passed = suiteResults.reduce((sum, s) => sum + s.passed, 0);
  const failed = suiteResults.reduce((sum, s) => sum + s.failed, 0);

  return {
    suites: suiteResults,
    summary: { total, passed, failed, duration },
  };
}

/**
 * Load all test suites.
 * Each suite module exports `suite(client)` returning { name, tests }.
 */
async function loadSuites(client) {
  const modules = [
    import('../tests/health.test.mjs'),
    import('../tests/compute-distance.test.mjs'),
    import('../tests/compute-area.test.mjs'),
    import('../tests/compute-length.test.mjs'),
    import('../tests/compute-contains.test.mjs'),
    import('../tests/compute-within.test.mjs'),
    import('../tests/compute-intersects.test.mjs'),
    import('../tests/verify-stamp.test.mjs'),
    import('../tests/verify-proof.test.mjs'),
    import('../tests/attestation-decode.test.mjs'),
    import('../tests/attestation-signature.test.mjs'),
  ];

  const loaded = await Promise.all(modules);
  return loaded.map(m => m.suite(client));
}

/**
 * Load onchain test suites (requires PRIVATE_KEY + RPC_URL).
 */
export async function loadOnchainSuites(client, options) {
  const modules = [
    import('../tests/onchain-submission.test.mjs'),
    import('../tests/round-trip.test.mjs'),
  ];
  const loaded = await Promise.all(modules);
  return loaded.map(m => m.suite(client, options));
}
