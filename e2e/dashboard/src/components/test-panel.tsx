import React, { useState } from 'react';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { SUITE_GROUPS, type SuiteResult, type TestResult, type Assertion } from '../lib/use-tests';
import { extractAttestationData, submitAttestation, type SubmitResult } from '../lib/onchain-submit';
import { TestMinimap } from './test-minimap';
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

interface SubmitState {
  status: 'idle' | 'submitting' | 'done' | 'error';
  result?: SubmitResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractComputeResult(assertions: Assertion[]): {
  result: number | boolean | null;
  units: string | null;
  operation: string | null;
} | null {
  for (const a of assertions) {
    if (!a.details?.actual) continue;
    const actual = a.details.actual;
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

function formatResult(result: number | boolean | null, units: string | null): string {
  if (result === null) return '—';
  if (typeof result === 'boolean') return result ? 'true' : 'false';
  const formatted = result.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (units === 'meters') {
    if (result >= 1000) return `${(result / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
    return `${formatted} m`;
  }
  if (units === 'square_meters') {
    if (result >= 1_000_000) return `${(result / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km²`;
    return `${formatted} m²`;
  }
  return formatted;
}

/** Pick the most informative assertion message to show in the collapsed row */
function pickSummaryMessage(assertions: Assertion[]): string | null {
  // Prefer numeric/boolean result assertion, then attestation, then status
  for (const a of assertions) {
    if (a.message.startsWith('result ')) return a.message;
  }
  for (const a of assertions) {
    if (a.message.includes('Attestation')) return a.message;
  }
  for (const a of assertions) {
    if (!a.message.startsWith('HTTP ')) return a.message;
  }
  return assertions[0]?.message ?? null;
}

/** Humanize a test name: "distance-sf-nyc" → "sf nyc" */
function humanize(name: string): string {
  return name
    .replace(/^(distance|area|length|contains|within|intersects|health|stamp|proof|decode|signature)-?/, '')
    .replace(/-/g, ' ')
    .trim();
}

function shortenHex(hex: string, chars = 8): string {
  if (hex.length <= chars * 2 + 4) return hex;
  return hex.slice(0, chars + 2) + '…' + hex.slice(-chars);
}

const OP_COLORS: Record<string, string> = {
  distance: 'bg-blue-100 text-blue-700',
  area: 'bg-violet-100 text-violet-700',
  length: 'bg-teal-100 text-teal-700',
  contains: 'bg-amber-100 text-amber-700',
  within: 'bg-amber-100 text-amber-700',
  intersects: 'bg-orange-100 text-orange-700',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
              {(() => {
                const g = suites.reduce(
                  (acc, s) => {
                    const r = resultMap.get(s);
                    if (r) { acc.passed += r.passed; acc.total += r.results.length; }
                    return acc;
                  },
                  { passed: 0, total: 0 },
                );
                if (g.total === 0) return null;
                return (
                  <Badge
                    variant={g.passed === g.total ? 'success' : 'destructive'}
                    className="ml-auto text-[10px] px-1.5 py-0"
                  >
                    {g.passed}/{g.total}
                  </Badge>
                );
              })()}
            </div>

            {/* Suite / test rows */}
            <div className="space-y-px">
              {suites.map(suiteName => {
                const suiteResult = resultMap.get(suiteName);
                const tests = suiteResult?.results ?? [];

                // No results yet — just show suite checkbox
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
                  const compute = extractComputeResult(test.assertions);
                  const submitState = submitStates[test.name] ?? { status: 'idle' };
                  const summary = pickSummaryMessage(test.assertions);
                  const label = humanize(test.name);

                  return (
                    <div key={test.name}>
                      {/* ---- Collapsed row (2 lines) ---- */}
                      <div
                        className={`pl-9 pr-3 py-2 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                        onClick={() => setExpandedTest(isExpanded ? null : test.name)}
                      >
                        {/* Top line: checkbox, op tag, name, result, badge, duration, chevron */}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedSuites.has(suiteName)}
                            onCheckedChange={() => onToggleSuite(suiteName)}
                            onClick={(e) => e.stopPropagation()}
                          />

                          {/* Operation tag */}
                          {compute?.operation && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${OP_COLORS[compute.operation] ?? 'bg-gray-100 text-gray-600'}`}>
                              {compute.operation}
                            </span>
                          )}

                          {/* Test name */}
                          <span className="text-xs font-medium flex-1 truncate">
                            {label || test.name}
                          </span>

                          {/* Computed result value */}
                          {compute && compute.result !== null && (
                            <span className="text-sm font-mono font-semibold tabular-nums text-foreground/80">
                              {formatResult(compute.result, compute.units)}
                            </span>
                          )}

                          {/* Attestation available indicator */}
                          {attData && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"
                              title="Attestation available"
                            />
                          )}

                          {/* Pass / Fail */}
                          {test.pass ? (
                            <Badge variant="success" className="text-[10px]">Pass</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              {test.error ? 'Error' : 'Fail'}
                            </Badge>
                          )}

                          <span className="text-[10px] font-mono text-muted-foreground w-12 text-right flex-shrink-0">
                            {test.duration}ms
                          </span>

                          <svg
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Bottom line: summary message + assertion count */}
                        <div className="flex items-center gap-2 pl-7 mt-0.5">
                          {summary && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {summary}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
                            {test.assertions.filter(a => a.pass).length}/{test.assertions.length} checks
                          </span>
                        </div>
                      </div>

                      {/* ---- Expanded detail ---- */}
                      {isExpanded && (
                        <div className="pl-14 pr-3 pb-4 pt-2 space-y-4 bg-accent/30 border-b border-border/40">
                          {test.error && (
                            <div className="p-2 rounded bg-red-50 text-red-700 text-xs font-mono">
                              {test.error}
                            </div>
                          )}

                          {/* Minimap of test geometries */}
                          <TestMinimap testName={test.name} />

                          {/* Result hero card */}
                          {compute && compute.result !== null && (
                            <div className="p-4 rounded-lg bg-background border border-border/60">
                              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                                {compute.operation}
                              </div>
                              <div className="text-2xl font-mono font-bold">
                                {formatResult(compute.result, compute.units)}
                              </div>
                            </div>
                          )}

                          {/* All assertions */}
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                              Checks
                            </div>
                            {test.assertions.map((a, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className={`text-xs leading-tight ${a.pass ? 'text-green-600' : 'text-red-600'}`}>
                                  {a.pass ? '\u2713' : '\u2717'}
                                </span>
                                <span className="text-xs text-foreground/80">{a.message}</span>
                              </div>
                            ))}
                          </div>

                          {/* Attestation + Register Onchain */}
                          {attData && (
                            <div className="p-4 rounded-lg bg-background border border-border/60 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Attestation
                                </div>
                                {submitState.status === 'done' && submitState.result && (
                                  <Badge variant="success">Registered</Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                                <span className="text-muted-foreground">Schema</span>
                                <span className="font-mono">{shortenHex(attData.attestation.schema)}</span>
                                <span className="text-muted-foreground">Recipient</span>
                                <span className="font-mono">{shortenHex(attData.attestation.recipient)}</span>
                                <span className="text-muted-foreground">Attester</span>
                                <span className="font-mono">{shortenHex(attData.delegatedAttestation.attester)}</span>
                              </div>

                              <div className="pt-2">
                                {submitState.status === 'idle' && walletConnected && (
                                  <Button
                                    className="w-full"
                                    onClick={(e) => { e.stopPropagation(); handleRegisterOnchain(test); }}
                                  >
                                    Register Onchain
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
                                  <div className="flex items-center justify-center gap-4 text-sm pt-1">
                                    <a
                                      href={`https://sepolia.basescan.org/tx/${submitState.result.txHash}`}
                                      target="_blank" rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                    >
                                      View Transaction
                                    </a>
                                    {submitState.result.uid && (
                                      <a
                                        href={`https://base-sepolia.easscan.org/attestation/view/${submitState.result.uid}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                      >
                                        View Attestation
                                      </a>
                                    )}
                                  </div>
                                )}
                                {submitState.status === 'error' && (
                                  <div className="space-y-2">
                                    <div className="text-xs text-red-600 text-center">{submitState.error}</div>
                                    <Button
                                      variant="outline" className="w-full"
                                      onClick={(e) => { e.stopPropagation(); handleRegisterOnchain(test); }}
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
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}
    </div>
  );
}
