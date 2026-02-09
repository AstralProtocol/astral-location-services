import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import type { TestResult } from '../lib/use-tests';

interface Props {
  test: TestResult | null;
}

export function AttestationInspector({ test }: Props) {
  if (!test) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attestation Inspector</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Click a test row to inspect its attestation.</p>
        </CardContent>
      </Card>
    );
  }

  // Extract attestation details from test assertions
  const details = test.assertions.flatMap(a => {
    if (!a.details) return [];
    return [a.details];
  });

  const attestation = details.find(d => d.actual && typeof d.actual === 'object' && 'attestation' in (d.actual as Record<string, unknown>));
  const att = attestation?.actual as Record<string, unknown> | undefined;
  const attData = att?.attestation as Record<string, unknown> | undefined;
  const delData = att?.delegatedAttestation as Record<string, unknown> | undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Attestation Inspector</CardTitle>
          <Badge variant={test.pass ? 'success' : 'destructive'}>
            {test.pass ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-xs text-muted-foreground">Test</span>
          <p className="text-sm font-mono">{test.name}</p>
        </div>

        <Separator />

        {test.error && (
          <div className="p-2 rounded bg-destructive/10 text-destructive text-xs font-mono">
            {test.error}
          </div>
        )}

        {test.assertions.map((a, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={a.pass ? 'text-green-600' : 'text-red-600'}>
              {a.pass ? '\u2713' : '\u2717'}
            </span>
            <span className="text-xs">{a.message}</span>
          </div>
        ))}

        {attData && (
          <>
            <Separator />
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">Schema</span>
                <p className="text-xs font-mono truncate">{String(attData.schema)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Recipient</span>
                <p className="text-xs font-mono truncate">{String(attData.recipient)}</p>
              </div>
              {delData && delData.attester != null && (
                <div>
                  <span className="text-xs text-muted-foreground">Attester</span>
                  <p className="text-xs font-mono truncate">{String(delData.attester)}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Signature</span>
                <p className="text-xs font-mono truncate">{String(attData.signature)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Data</span>
                <p className="text-xs font-mono truncate max-w-full">{String(attData.data).slice(0, 80)}...</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
