import { useState, useCallback, useRef, useEffect } from 'react';
import { ethers } from 'ethers';

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_HEX = '0x' + BASE_SEPOLIA_CHAIN_ID.toString(16);

interface WalletState {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  wrongChain: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    connected: false,
    wrongChain: false,
  });
  const [hasInjectedWallet, setHasInjectedWallet] = useState(
    typeof window !== 'undefined' && !!(window as any).ethereum
  );
  const providerRef = useRef<ethers.BrowserProvider | null>(null);

  // Some wallets inject window.ethereum asynchronously — poll briefly
  useEffect(() => {
    if (hasInjectedWallet) return;
    let attempts = 0;
    const interval = setInterval(() => {
      if ((window as any).ethereum) {
        setHasInjectedWallet(true);
        clearInterval(interval);
      }
      if (++attempts >= 10) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [hasInjectedWallet]);

  const connect = useCallback(async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    try {
      // Request accounts first
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });

      // Use raw eth_chainId — more reliable than provider.getNetwork() which
      // can throw "disconnected from all chains" on Rabby and similar wallets
      const hexChain: string = await ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(hexChain, 16);

      // Create provider only after we know the wallet is connected
      const provider = new ethers.BrowserProvider(ethereum);
      providerRef.current = provider;

      setState({
        address: accounts[0] ?? null,
        chainId,
        connected: accounts.length > 0,
        wrongChain: chainId !== BASE_SEPOLIA_CHAIN_ID,
      });

      // Listen for account/chain changes
      ethereum.on('accountsChanged', (accs: string[]) => {
        if (accs.length === 0) {
          setState({ address: null, chainId: null, connected: false, wrongChain: false });
          providerRef.current = null;
        } else {
          setState(prev => ({ ...prev, address: accs[0] }));
        }
      });

      ethereum.on('chainChanged', (newHexChainId: string) => {
        const newChainId = parseInt(newHexChainId, 16);
        setState(prev => ({
          ...prev,
          chainId: newChainId,
          wrongChain: newChainId !== BASE_SEPOLIA_CHAIN_ID,
        }));
        // Recreate provider on chain change so getSigner uses the new chain
        providerRef.current = new ethers.BrowserProvider(ethereum);
      });
    } catch (err) {
      console.error('Wallet connect failed:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      ethereum.removeAllListeners?.('accountsChanged');
      ethereum.removeAllListeners?.('chainChanged');
    }
    providerRef.current = null;
    setState({ address: null, chainId: null, connected: false, wrongChain: false });
  }, []);

  const switchChain = useCallback(async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA_HEX }],
      });
    } catch (err: any) {
      // Chain not added — try adding it
      if (err.code === 4902) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BASE_SEPOLIA_HEX,
            chainName: 'Base Sepolia',
            rpcUrls: ['https://sepolia.base.org'],
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            blockExplorerUrls: ['https://sepolia.basescan.org'],
          }],
        });
      }
    }
  }, []);

  const getSigner = useCallback(async (): Promise<ethers.Signer | null> => {
    if (!providerRef.current) return null;
    return providerRef.current.getSigner();
  }, []);

  return {
    ...state,
    hasInjectedWallet,
    connect,
    disconnect,
    switchChain,
    getSigner,
  };
}
