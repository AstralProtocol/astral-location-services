import React, { useState } from 'react';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { SUITE_GROUPS, type SuiteResult, type TestResult, type Assertion } from '../lib/use-tests';
import { extractAttestationData, submitAttestation, type SubmitResult } from '../lib/onchain-submit';
import { ethers } from 'ethers';

interface Props {
  selectedSuites: Set<string>;
  onToggleSuite: (suite: string) => void;
  onToggleGroup: (group: string, suites: string[]) => void;
  results: SuiteResult[];
  progress: { completed: number; total: number };
  getSigner: () => Promise<ethers.Signer | null>;
  walletConnected: boolean;
}

// Per-test onchain submission state
interface SubmitState {
  status: 'idle' | 'submitting' | 'done' | 'error';
  result?: SubmitResult;
  error?: string;
}

// Extract the computed result from assertions
function extractComputeResult(assertions: Assertion[]): {
  result: number | boolean | null;
  units: string | null;
  operation: string | null;
} | null {
  for (const a of assertions) {
    if (!a.details?.actual) continue;
    const actual = a.details.actual;
    // Make sure it's an object before using 'in'
    if (typeof actual !== 'object' || actual === null) continue;
    const obj = actual as Record<string, unknown>;
    if ('result' in obj && 'operation' in obj) {
      return {
        result: obj.result as number | boolean,
        units: (obj.units as string) || null,
        operation: obj.operation as string,
      };
    }
  }
  return null;
}

// Format a numeric result for display
function formatResult(result: number | boolean | null, units: string | null): string {
  if (result === null) return '—';
  if (typeof result === 'boolean') return result ? 'true' : 'false';

  // Format large numbers with commas
  const formatted = result.toLocaleString('en-US', { maximumFractionDigits: 2 });

  if (units === 'meters') {
    if (result >= 1000) {
      return `${(result / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
    }
    return `${formatted} m`;
  }
  if (units === 'square_meters') {
    if (result >= 1_000_000) {
      return `${(result / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km²`;
    }
    return `${formatted} m²`;
  }
  return formatted;
}

// Get operation icon/emoji
function getOperationIcon(operation: string | null): string {
  switch (operation) {
    case 'distance': return '📏';
    case 'area': return '📐';
    case 'length': return '📐';
    case 'contains': return '📍';
    case 'within': return '🎯';
    case 'intersects': return '✂️';
    default: return '✓';
  }
}

// Shorten hex strings for display
function shortenHex(hex: string, chars = 8): string {
  if (hex.length <= chars * 2 + 4) return hex;
  return hex.slice(0, chars + 2) + '…' + hex.slice(-chars);
}

export function TestPanel({
  selectedSuites,
  onToggleSuite,
  onToggleGroup,
  results,
  progress,
  getSigner,
  walletConnected,
}: Props) {
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [submitStates, setSubmitStates] = useState<Record<string, SubmitState>>({});

  const resultMap = new Map(results.map(r => [r.name, r]));
  const totalPassed = results.reduce((sum, s) => sum + s.passed, 0);
  const totalTests = results.reduce((sum, s) => sum + s.results.length, 0);
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const handleRegisterOnchain = async (test: TestResult) => {
    const attData = extractAttestationData(test.assertions);
    if (!attData) return;

    const signer = await getSigner();
    if (!signer) return;

    setSubmitStates(prev => ({ ...prev, [test.name]: { status: 'submitting' } }));

    try {
      const result = await submitAttestation(signer, attData.attestation, attData.delegatedAttestation);
      setSubmitStates(prev => ({ ...prev, [test.name]: { status: 'done', result } }));
    } catch (err: any) {
      setSubmitStates(prev => ({
        ...prev,
        [test.name]: { status: 'error', error: err.message || String(err) },
      }));
    }
  };

  // Filter SUITE_GROUPS to exclude onchain suites from the dashboard UI
  const visibleGroups = SUITE_GROUPS.filter(g => g.group !== 'Onchain');

  return (
    <div className="space-y-1">
      {visibleGroups.map(({ group, suites }) => {
        const allSelected = suites.every(s => selectedSuites.has(s));
        const someSelected = suites.some(s => selectedSuites.has(s));

        return (
          <div key={group}>
            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-2">
              <Checkbox
                checked={allSelected}
                data-state={someSelected && !allSelected ? 'indeterminate' : undefined}
                onCheckedChange={() => onToggleGroup(group, suites)}
              />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </span>
              {/* Group summary badge */}
              {(() => {
                const suiteResult = suites.reduce(
                  (acc, s) => {
                    const r = resultMap.get(s);
                    if (r) {
                      acc.passed += r.passed;
                      acc.total += r.results.length;
                    }
                    return acc;
                  },
                  { passed: 0, total: 0 },
                );
                if (suiteResult.total === 0) return null;
                const allPass = suiteResult.passed === suiteResult.total;
                return (
                  <Badge variant={allPass ? 'success' : 'destructive'} className="ml-auto text-[10px] px-1.5 py-0">
                    {suiteResult.passed}/{suiteResult.total}
                  </Badge>
                );
              })()}
            </div>

            {/* Tests in group */}
            <div className="space-y-px">
              {suites.map(suiteName => {
                const suiteResult = resultMap.get(suiteName);
                const tests = suiteResult?.results ?? [];

                // If no results yet, show just the checkbox row
                if (tests.length === 0) {
                  return (
                    <div key={suiteName} className="flex items-center gap-2 pl-9 pr-3 py-1.5">
                      <Checkbox
                        checked={selectedSuites.has(suiteName)}
                        onCheckedChange={() => onToggleSuite(suiteName)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {suiteName.replace(/^(compute|verify|attestation)-/, '')}
                      </span>
                    </div>
                  );
                }

                return tests.map(test => {
                  const isExpanded = expandedTest === test.name;
                  const attData = extractAttestationData(test.assertions);
                  const computeResult = extractComputeResult(test.assertions);
                  const submitState = submitStates[test.name] ?? { status: 'idle' };

                  return (
                    <div key={test.name}>
                      {/* Test row - collapsed */}
                      <div
                        className={`flex items-center gap-3 pl-9 pr-3 py-2.5 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                        onClick={() => setExpandedTest(isExpanded ? null : test.name)}
                      >
                        <Checkbox
                          checked={selectedSuites.has(suiteName)}
                          onCheckedChange={() => onToggleSuite(suiteName)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        {/* Operation icon */}
                        {computeResult && (
                          <span className="text-sm" title={computeResult.operation || undefined}>
                            {getOperationIcon(computeResult.operation)}
                          </span>
                        )}

                        {/* Test name */}
                        <span className="text-xs font-medium flex-1 truncate">
                          {test.name.replace(/^(distance|area|length|contains|within|intersects)-/, '')}
                        </span>

                        {/* Result value - the key info! */}
                        {computeResult && computeResult.result !== null && (
                          <span className="text-sm font-mono font-semibold text-foreground/80">
                            {formatResult(computeResult.result, computeResult.units)}
                          </span>
                        )}

                        {/* Pass/Fail badge */}
                        {test.pass ? (
                          <Badge variant="success" className="text-[10px]">Pass</Badge>
                        ) : test.error ? (
                          <Badge variant="destructive" className="text-[10px]">Error</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Fail</Badge>
                        )}

                        {/* Duration */}
                        <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">
                          {test.duration}ms
                        </span>

                        {/* Expand chevron */}
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="pl-14 pr-3 pb-4 pt-2 space-y-4 bg-accent/30 border-b border-border/40">
                          {/* Error message */}
                          {test.error && (
                            <div className="p-2 rounded bg-red-50 text-red-700 text-xs font-mono">
                              {test.error}
                            </div>
                          )}

                          {/* Compute result hero - big and clear */}
                          {computeResult && computeResult.result !== null && (
                            <div className="p-4 rounded-lg bg-background border border-border/60">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{getOperationIcon(computeResult.operation)}</span>
                                <div>
                                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                    {computeResult.operation}
                                  </div>
                                  <div className="text-2xl font-mono font-bold">
                                    {formatResult(computeResult.result, computeResult.units)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Assertions */}
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                              Checks
                            </div>
                            {test.assertions.map((a, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className={`text-sm ${a.pass ? 'text-green-600' : 'text-red-600'}`}>
                                  {a.pass ? '✓' : '✗'}
                                </span>
                                <span className="text-xs text-foreground/80">{a.message}</span>
                              </div>
                            ))}
                          </div>

                          {/* Attestation data + Register button */}
                          {attData && (
                            <div className="p-4 rounded-lg bg-background border border-border/60 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Attestation Ready
                                </div>
                                {submitState.status === 'done' && submitState.result && (
                                  <Badge variant="success">Registered</Badge>
                                )}
                              </div>

                              {/* Attestation details */}
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                                <span className="text-muted-foreground">Schema</span>
                                <span className="font-mono">{shortenHex(attData.attestation.schema)}</span>
                                <span className="text-muted-foreground">Recipient</span>
                                <span className="font-mono">{shortenHex(attData.attestation.recipient)}</span>
                                <span className="text-muted-foreground">Attester</span>
                                <span className="font-mono">{shortenHex(attData.delegatedAttestation.attester)}</span>
                              </div>

                              {/* Register onchain button - prominent! */}
                              <div className="pt-2">
                                {submitState.status === 'idle' && walletConnected && (
                                  <Button
                                    className="w-full"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRegisterOnchain(test);
                                    }}
                                  >
                                    Register Onchain →
                                  </Button>
                                )}
                                {submitState.status === 'idle' && !walletConnected && (
                                  <div className="text-center py-2 text-sm text-muted-foreground">
                                    Connect wallet to register this result onchain
                                  </div>
                                )}
                                {submitState.status === 'submitting' && (
                                  <div className="text-center py-2 text-sm text-muted-foreground">
                                    Waiting for wallet signature...
                                  </div>
                                )}
                                {submitState.status === 'done' && submitState.result && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-center gap-4 text-sm">
                                      <a
                                        href={`https://sepolia.basescan.org/tx/${submitState.result.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                      >
                                        View Transaction →
                                      </a>
                                      {submitState.result.uid && (
                                        <a
                                          href={`https://base-sepolia.easscan.org/attestation/view/${submitState.result.uid}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline"
                                        >
                                          View Attestation →
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {submitState.status === 'error' && (
                                  <div className="space-y-2">
                                    <div className="text-xs text-red-600 text-center">{submitState.error}</div>
                                    <Button
                                      variant="outline"
                                      className="w-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRegisterOnchain(test);
                                      }}
                                    >
                                      Retry
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>
          </div>
        );
      })}

      {/* Summary footer */}
      {totalTests > 0 && (
        <div className="pt-3 px-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {totalPassed}/{totalTests} passed
            </span>
            <span className="text-xs text-muted-foreground">
              {pct}%
            </span>
          </div>
          <Progress value={pct} />
        </div>
      )}
    </div>
  );
}
