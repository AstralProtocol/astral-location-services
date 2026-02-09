import React, { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface Props {
  targetUrl: string;
  onTargetChange: (url: string) => void;
  onRunAll: () => void;
  onRunSelected: () => void;
  connected: boolean | null;
  running: boolean;
}

const ENVIRONMENTS = [
  { value: 'http://localhost:3000', label: 'Local', description: 'localhost:3000' },
  { value: 'https://staging-api.astral.global', label: 'Staging', description: 'staging-api.astral.global' },
];

export function EnvironmentSelector({ targetUrl, onTargetChange, onRunAll, onRunSelected, connected, running }: Props) {
  const [customUrl, setCustomUrl] = useState('');
  const [activeEnv, setActiveEnv] = useState<string>(ENVIRONMENTS[0].value);

  const isCustom = activeEnv === 'custom';

  useEffect(() => {
    if (!isCustom) {
      onTargetChange(activeEnv);
    }
  }, [activeEnv, isCustom, onTargetChange]);

  const handleEnvClick = (value: string) => {
    setActiveEnv(value);
  };

  const handleCustomUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomUrl(e.target.value);
    if (isCustom && e.target.value) {
      onTargetChange(e.target.value);
    }
  };

  const handleCustomFocus = () => {
    setActiveEnv('custom');
    if (customUrl) onTargetChange(customUrl);
  };

  const statusDot = connected === null
    ? 'bg-gray-300'
    : connected
    ? 'bg-green-500'
    : 'bg-red-400';

  const statusText = connected === null
    ? 'Not checked'
    : connected
    ? 'Connected'
    : 'Disconnected';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {ENVIRONMENTS.map(env => (
          <button
            key={env.value}
            onClick={() => handleEnvClick(env.value)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              activeEnv === env.value
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {env.label}
          </button>
        ))}
        <button
          onClick={() => handleEnvClick('custom')}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
            isCustom
              ? 'bg-foreground text-background font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          Custom
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>

        <Button onClick={onRunAll} disabled={running} size="sm" className="text-xs h-8">
          {running ? 'Running\u2026' : 'Run All'}
        </Button>
        <Button onClick={onRunSelected} disabled={running} variant="outline" size="sm" className="text-xs h-8">
          Run Selected
        </Button>
      </div>

      {/* Target URL display */}
      <div className="flex items-center gap-2">
        {isCustom ? (
          <Input
            value={customUrl}
            onChange={handleCustomUrlChange}
            onFocus={handleCustomFocus}
            placeholder="https://your-api.example.com"
            className="font-mono text-xs h-8 max-w-sm"
            autoFocus
          />
        ) : (
          <span className="text-xs font-mono text-muted-foreground px-1">
            {targetUrl}
          </span>
        )}
      </div>
    </div>
  );
}
