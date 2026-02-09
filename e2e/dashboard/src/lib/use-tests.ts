import { useState, useCallback, useRef } from 'react';
import { createClient } from '../../../lib/api-client.mjs';
import { runAll, loadOnchainSuites, runSuite } from '../../../lib/test-runner.mjs';

export interface Assertion {
  pass: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface TestResult {
  name: string;
  pass: boolean;
  duration: number;
  assertions: Assertion[];
  error?: string;
}

export interface SuiteResult {
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
}

export interface RunResult {
  suites: SuiteResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
}

// Suite definitions with their parent groups
export const SUITE_GROUPS = [
  {
    group: 'Health',
    suites: ['health'],
  },
  {
    group: 'Compute',
    suites: [
      'compute-distance',
      'compute-area',
      'compute-length',
      'compute-contains',
      'compute-within',
      'compute-intersects',
    ],
  },
  {
    group: 'Verify',
    suites: ['verify-stamp', 'verify-proof'],
  },
  {
    group: 'Attestation',
    suites: ['attestation-decode', 'attestation-signature'],
  },
  {
    group: 'Onchain',
    suites: ['onchain', 'round-trip'],
  },
];

export function useTests() {
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [results, setResults] = useState<SuiteResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<Record<string, unknown> | null>(null);
  const abortRef = useRef(false);

  const checkHealth = useCallback(async (baseUrl: string) => {
    try {
      const client = (createClient as any)(baseUrl);
      const res = await client.health();
      setConnected(res.ok);
      return res.ok;
    } catch {
      setConnected(false);
      return false;
    }
  }, []);

  const runTests = useCallback(async (
    baseUrl: string,
    selectedSuites: string[],
    onchainOptions?: { privateKey?: string; rpcUrl?: string; signer?: unknown }
  ) => {
    setRunning(true);
    setResults([]);
    setProgress({ completed: 0, total: 0 });
    abortRef.current = false;

    const client = (createClient as any)(baseUrl);
    const isOnchain = selectedSuites.some(s => s === 'onchain' || s === 'round-trip');
    const standardSuites = selectedSuites.filter(s => s !== 'onchain' && s !== 'round-trip');

    try {
      let totalTests = 0;
      let completedTests = 0;
      const allSuiteResults: SuiteResult[] = [];

      // Run standard suites
      if (standardSuites.length > 0) {
        // Use a delay for non-local targets to avoid rate limiting
        const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
        const delayMs = isLocal ? 0 : 300;

        const result = await (runAll as any)(client, {
          suites: standardSuites.length > 0 ? standardSuites : undefined,
          delayMs,
          onTestComplete: () => {
            completedTests++;
            setProgress(p => ({ ...p, completed: completedTests }));
          },
          onSuiteComplete: (s: any) => {
            allSuiteResults.push(s as SuiteResult);
            setResults([...allSuiteResults]);
          },
        }) as RunResult;
        totalTests += result.summary.total;
      }

      // Run onchain suites if selected (need either a wallet signer or private key)
      if (isOnchain && (onchainOptions?.privateKey || onchainOptions?.signer)) {
        const onchainSuiteList = await (loadOnchainSuites as any)(client, onchainOptions) as any[];
        for (const suite of onchainSuiteList) {
          if (abortRef.current) break;
          const result = await (runSuite as any)(suite.name, suite.tests, {
            onTestComplete: () => {
              completedTests++;
              setProgress(p => ({ ...p, completed: completedTests }));
            },
          }) as SuiteResult;
          allSuiteResults.push(result);
          setResults([...allSuiteResults]);
          totalTests += result.results.length;
        }
      }

      setProgress({ completed: totalTests, total: totalTests });
    } catch (err) {
      console.error('Test run error:', err);
    } finally {
      setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    running,
    connected,
    results,
    progress,
    selectedTest,
    selectedResponse,
    setSelectedTest,
    setSelectedResponse,
    checkHealth,
    runTests,
    stop,
  };
}
