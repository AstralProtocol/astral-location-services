import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Progress } from './ui/progress';
import { SUITE_GROUPS, type SuiteResult } from '../lib/use-tests';

interface Props {
  selectedSuites: Set<string>;
  onToggleSuite: (suite: string) => void;
  onToggleGroup: (group: string, suites: string[]) => void;
  results: SuiteResult[];
  progress: { completed: number; total: number };
}

export function SuiteSidebar({ selectedSuites, onToggleSuite, onToggleGroup, results, progress }: Props) {
  const resultMap = new Map(results.map(r => [r.name, r]));

  const totalPassed = results.reduce((sum, s) => sum + s.passed, 0);
  const totalTests = results.reduce((sum, s) => sum + s.results.length, 0);
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Test Suites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {SUITE_GROUPS.map(({ group, suites }) => {
          const allSelected = suites.every(s => selectedSuites.has(s));
          const someSelected = suites.some(s => selectedSuites.has(s));

          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={allSelected}
                  data-state={someSelected && !allSelected ? 'indeterminate' : undefined}
                  onCheckedChange={() => onToggleGroup(group, suites)}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</span>
              </div>
              <div className="ml-6 space-y-1">
                {suites.map(suite => {
                  const result = resultMap.get(suite);
                  const icon = result
                    ? result.failed === 0
                      ? '\u2713'
                      : '\u2717'
                    : '';
                  const color = result
                    ? result.failed === 0
                      ? 'text-green-600'
                      : 'text-red-600'
                    : '';

                  return (
                    <div key={suite} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedSuites.has(suite)}
                        onCheckedChange={() => onToggleSuite(suite)}
                      />
                      <span className="text-xs">{suite.replace('compute-', '').replace('verify-', '').replace('attestation-', '')}</span>
                      {icon && <span className={`text-xs ${color}`}>{icon}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="pt-3 border-t">
          <div className="text-sm text-muted-foreground mb-2">
            {totalPassed}/{totalTests} passed
          </div>
          <Progress value={pct} />
        </div>
      </CardContent>
    </Card>
  );
}
