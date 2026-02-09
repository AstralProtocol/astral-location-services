import React, { useState, useCallback } from 'react';
import { EnvironmentSelector } from './components/environment-selector';
import { TestPanel } from './components/test-panel';
import { MapView } from './components/map-view';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import { useTests, SUITE_GROUPS } from './lib/use-tests';
import { useWallet } from './lib/use-wallet';

// All non-onchain suites selected by default
const defaultSuites = new Set(
  SUITE_GROUPS
    .filter(g => g.group !== 'Onchain')
    .flatMap(g => g.suites)
);

function shortenAddress(addr: string) {
  return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
}

export default function App() {
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000');
  const [selectedSuites, setSelectedSuites] = useState<Set<string>>(defaultSuites);
  const [privateKey, setPrivateKey] = useState('');
  const [rpcUrl, setRpcUrl] = useState('https://sepolia.base.org');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const wallet = useWallet();

  const {
    running,
    connected,
    results,
    progress,
    checkHealth,
    runTests,
  } = useTests();

  const handleTargetChange = useCallback((url: string) => {
    setTargetUrl(url);
    checkHealth(url);
  }, [checkHealth]);

  const toggleSuite = useCallback((suite: string) => {
    setSelectedSuites(prev => {
      const next = new Set(prev);
      if (next.has(suite)) {
        next.delete(suite);
      } else {
        next.add(suite);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((_group: string, suites: string[]) => {
    setSelectedSuites(prev => {
      const next = new Set(prev);
      const allSelected = suites.every(s => next.has(s));
      for (const s of suites) {
        if (allSelected) {
          next.delete(s);
        } else {
          next.add(s);
        }
      }
      return next;
    });
  }, []);

  const buildOnchainOptions = useCallback(async () => {
    if (wallet.connected) {
      const signer = await wallet.getSigner();
      return { signer, rpcUrl };
    }
    if (privateKey) {
      return { privateKey, rpcUrl };
    }
    return { rpcUrl };
  }, [wallet, privateKey, rpcUrl]);

  const handleRunAll = useCallback(async () => {
    const allSuites = SUITE_GROUPS
      .filter(g => g.group !== 'Onchain')
      .flatMap(g => g.suites);
    const opts = await buildOnchainOptions();
    runTests(targetUrl, allSuites, opts);
  }, [targetUrl, runTests, buildOnchainOptions]);

  const handleRunSelected = useCallback(async () => {
    const opts = await buildOnchainOptions();
    runTests(targetUrl, Array.from(selectedSuites), opts);
  }, [targetUrl, selectedSuites, runTests, buildOnchainOptions]);

  return (
    <div className="min-h-screen p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground/90">Astral E2E Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Test runner for Astral Location Services. Pick a target, run tests,
            then register any result onchain.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wallet.connected ? (
            <div className="flex items-center gap-2">
              {wallet.wrongChain && (
                <button
                  onClick={wallet.switchChain}
                  className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-100 transition-colors"
                >
                  Wrong network
                </button>
              )}
              <span className="text-xs font-mono text-muted-foreground">
                {shortenAddress(wallet.address!)}
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <button
                onClick={wallet.disconnect}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : wallet.hasInjectedWallet ? (
            <Button variant="outline" size="sm" onClick={wallet.connect} className="text-xs h-8">
              Connect Wallet
            </Button>
          ) : (
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKeyInput ? 'Hide key' : 'Use private key'}
            </button>
          )}
        </div>
      </div>

      {/* Private key fallback (no wallet detected) */}
      {showKeyInput && !wallet.connected && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            placeholder="Private key (0x...)"
            className="font-mono text-xs h-8 max-w-xs"
          />
          <Input
            value={rpcUrl}
            onChange={e => setRpcUrl(e.target.value)}
            placeholder="RPC URL"
            className="font-mono text-xs h-8 max-w-xs"
          />
          <span className="text-[10px] text-muted-foreground">Never leaves your browser</span>
        </div>
      )}

      {/* Environment Selector */}
      <EnvironmentSelector
        targetUrl={targetUrl}
        onTargetChange={handleTargetChange}
        onRunAll={handleRunAll}
        onRunSelected={handleRunSelected}
        connected={connected}
        running={running}
      />

      {/* Test Panel — unified suite selection + results */}
      <Card>
        <TestPanel
          selectedSuites={selectedSuites}
          onToggleSuite={toggleSuite}
          onToggleGroup={toggleGroup}
          results={results}
          progress={progress}
          getSigner={wallet.getSigner}
          walletConnected={wallet.connected}
        />
      </Card>

      {/* Map View */}
      <MapView results={results} selectedTest={null} />
    </div>
  );
}
