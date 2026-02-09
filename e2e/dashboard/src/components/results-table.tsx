import React from 'react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import type { SuiteResult, TestResult } from '../lib/use-tests';

interface Props {
  results: SuiteResult[];
  selectedTest: TestResult | null;
  onSelectTest: (test: TestResult) => void;
}

export function ResultsTable({ results, selectedTest, onSelectTest }: Props) {
  const allTests = results.flatMap(suite =>
    suite.results.map(test => ({ ...test, suite: suite.name }))
  );

  return (
    <ScrollArea className="h-[400px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border/60">
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Test</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Suite</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
            <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {allTests.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center p-8 text-muted-foreground">
                No results yet. Run tests to see results.
              </td>
            </tr>
          )}
          {allTests.map((test, i) => (
            <tr
              key={`${test.suite}-${test.name}-${i}`}
              className={`border-b border-border/40 cursor-pointer hover:bg-accent/50 transition-colors ${
                selectedTest?.name === test.name ? 'bg-accent' : ''
              }`}
              onClick={() => onSelectTest(test)}
            >
              <td className="px-3 py-2.5 font-mono text-xs">{test.name}</td>
              <td className="px-3 py-2.5">
                <span className="text-xs text-muted-foreground">{test.suite}</span>
              </td>
              <td className="px-3 py-2.5">
                {test.pass ? (
                  <Badge variant="success">Pass</Badge>
                ) : test.error ? (
                  <Badge variant="destructive">Error</Badge>
                ) : (
                  <Badge variant="destructive">Fail</Badge>
                )}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                {test.duration}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
