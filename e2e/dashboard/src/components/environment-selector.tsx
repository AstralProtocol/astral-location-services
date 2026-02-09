import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { createClient } from '../../../lib/api-client.mjs';

interface Props {
  targetUrl: string;
  onTargetChange: (url: string) => void;
  onRunAll: () => void;
  onRunSelected: () => void;
  connected: boolean | null;
  running: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

interface EnvOption {
  value: string;
  label: string;
  description: string;
  warning?: string;
}

const ENVIRONMENTS: EnvOption[] = [
  { value: 'https://staging-api.astral.global', label: 'Staging', description: 'staging-api.astral.global' },
  { value: 'https://api.astral.global', label: 'Production', description: 'api.astral.global', warning: 'Limited availability' },
];

type KeyStatus = null | 'checking' | { valid: true; tier: string } | { valid: false };

export function EnvironmentSelector({ targetUrl, onTargetChange, onRunAll, onRunSelected, connected, running, apiKey, onApiKeyChange }: Props) {
  const [customUrl, setCustomUrl] = useState('');
  const [activeEnv, setActiveEnv] = useState<string>(ENVIRONMENTS[0].value);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isCustom = activeEnv === 'custom';
  const activeOption = ENVIRONMENTS.find(e => e.value === activeEnv);

  useEffect(() => {
    if (!isCustom) {
      onTargetChange(activeEnv);
    }
  }, [activeEnv, isCustom, onTargetChange]);

  const validateKey = useCallback(async (key: string, url: string) => {
    if (!key) {
      setKeyStatus(null);
      return;
    }
    setKeyStatus('checking');
    try {
      const client = (createClient as any)(url);
      const result = await client.validateKey(key);
      setKeyStatus(result);
    } catch {
      setKeyStatus({ valid: false });
    }
  }, []);

  const handleApiKeyChange = useCallback((key: string) => {
    onApiKeyChange(key);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!key) {
      setKeyStatus(null);
      return;
    }
    debounceRef.current = setTimeout(() => validateKey(key, targetUrl), 600);
  }, [onApiKeyChange, validateKey, targetUrl]);

  // Re-validate when target changes (if key is set)
  useEffect(() => {
    if (apiKey) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => validateKey(apiKey, targetUrl), 600);
    } else {
      setKeyStatus(null);
    }
  }, [targetUrl, apiKey, validateKey]);

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
                ? env.warning
                  ? 'bg-amber-600 text-white font-medium'
                  : 'bg-foreground text-background font-medium'
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

      {/* Target URL + API key */}
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
        <Input
          type="password"
          value={apiKey}
          onChange={e => handleApiKeyChange(e.target.value)}
          placeholder="API key (optional)"
          className={`font-mono text-xs h-8 w-[200px] ${
            keyStatus && keyStatus !== 'checking' && !keyStatus.valid
              ? 'border-red-300 focus-visible:ring-red-200'
              : keyStatus && keyStatus !== 'checking' && keyStatus.valid
              ? 'border-green-300 focus-visible:ring-green-200'
              : ''
          }`}
        />
        {keyStatus === 'checking' && (
          <span className="text-[10px] text-muted-foreground">checking...</span>
        )}
        {keyStatus && keyStatus !== 'checking' && keyStatus.valid && (
          <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 whitespace-nowrap">
            {keyStatus.tier}
          </span>
        )}
        {keyStatus && keyStatus !== 'checking' && !keyStatus.valid && (
          <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
            invalid
          </span>
        )}
        {activeOption?.warning && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
            {activeOption.warning}
          </span>
        )}
      </div>
    </div>
  );
}
