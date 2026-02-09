import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface WalletState {
  address: string | null;
  connected: boolean;
}

interface Props {
  wallet: WalletState;
  onPrivateKeyChange: (key: string) => void;
  rpcUrl: string;
  onRpcUrlChange: (url: string) => void;
  txHash?: string;
  uid?: string;
}

export function OnchainPanel({
  wallet,
  onPrivateKeyChange,
  rpcUrl,
  onRpcUrlChange,
  txHash,
  uid,
}: Props) {
  const [showKeyFallback, setShowKeyFallback] = useState(false);
  const [privateKey, setPrivateKey] = useState('');

  const handleKeyChange = (val: string) => {
    setPrivateKey(val);
    onPrivateKeyChange(val);
  };

  const hasCredentials = wallet.connected || privateKey.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Onchain Submission</CardTitle>
          {wallet.connected ? (
            <Badge variant="success">Wallet connected</Badge>
          ) : privateKey ? (
            <Badge variant="outline">Key set</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {wallet.connected ? (
          <p className="text-xs text-muted-foreground">
            Onchain tests will submit transactions using your connected wallet.
            Select the Onchain suite in the sidebar and run.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {hasCredentials
                ? 'Onchain tests will submit using the private key below.'
                : 'Connect a wallet (top right) or paste a private key to enable onchain tests.'}
            </p>

            <button
              onClick={() => setShowKeyFallback(!showKeyFallback)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              {showKeyFallback ? 'Hide private key input' : 'Use a private key instead'}
            </button>

            {showKeyFallback && (
              <div className="space-y-2 pt-1">
                <div>
                  <Input
                    type="password"
                    value={privateKey}
                    onChange={e => handleKeyChange(e.target.value)}
                    placeholder="0x..."
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Never leaves your browser. Used only for onchain test submission.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">RPC URL</label>
                  <Input
                    value={rpcUrl}
                    onChange={e => onRpcUrlChange(e.target.value)}
                    placeholder="https://sepolia.base.org"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Transaction/UID display */}
        {(txHash || uid) && <Separator />}

        {txHash && (
          <div>
            <span className="text-xs text-muted-foreground">Transaction</span>
            <p className="text-xs font-mono truncate">{txHash}</p>
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              View on Basescan
            </a>
          </div>
        )}

        {uid && (
          <div>
            <span className="text-xs text-muted-foreground">Attestation UID</span>
            <p className="text-xs font-mono truncate">{uid}</p>
            <a
              href={`https://base-sepolia.easscan.org/attestation/view/${uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              View on EASScan
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
