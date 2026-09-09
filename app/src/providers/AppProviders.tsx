import { useEffect, useState, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';

import { queryClient } from '../lib/ton';
import { ToastProvider } from '../components/ui/ToastProvider';

const manifestUrl = import.meta.env.DEV
  ? 'https://ton-blockchain.github.io/acton/tonconnect-manifest.json'
  : `${window.location.origin}${import.meta.env.BASE_URL}tonconnect-manifest.json`;

const darkColors = {
  background: {
    primary: '#19191B',
    secondary: '#19191B',
    segment: '#19191B',
    tint: '#19191B',
    qr: '#FFFFFF',
  },
  connectButton: { background: '#1EAEFB', foreground: '#FFFFFF' },
};

const lightColors = {
  background: {
    primary: '#FFFFFF',
    secondary: '#F0F1F3',
    segment: '#FFFFFF',
    tint: '#F0F1F3',
    qr: '#F0F1F3',
  },
  connectButton: { background: '#30A1F5', foreground: '#FFFFFF' },
};

function readInitialTheme() {
  if (typeof window === 'undefined') return THEME.DARK;
  return localStorage.getItem('nominator-pool-dapp:theme') === 'light'
    ? THEME.LIGHT
    : THEME.DARK;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [initialTheme] = useState(readInitialTheme);
  useEffect(() => {
    const saved = localStorage.getItem('nominator-pool-dapp:theme');
    document.documentElement.setAttribute(
      'data-theme',
      saved === 'light' ? 'light' : 'dark',
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TonConnectUIProvider
        manifestUrl={manifestUrl}
        analytics={{ mode: 'off' }}
        uiPreferences={{
          theme: initialTheme,
          colorsSet: { [THEME.DARK]: darkColors, [THEME.LIGHT]: lightColors },
        }}
      >
        <ToastProvider>{children}</ToastProvider>
      </TonConnectUIProvider>
    </QueryClientProvider>
  );
}
