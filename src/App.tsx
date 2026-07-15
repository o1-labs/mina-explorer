import type { ReactNode } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { NetworkProvider } from '@/context/NetworkContext';
import { PriceProvider } from '@/context/PriceContext';
import { Layout, ErrorBoundary } from '@/components/common';
import {
  HomePage,
  BlocksPage,
  BlockDetailPage,
  TransactionsPage,
  TransactionDetailPage,
  AccountsPage,
  AccountPage,
  StakingPage,
  ZkAppsPage,
  AnalyticsPage,
  BroadcastPage,
  NotFoundPage,
} from '@/pages';

export function App(): ReactNode {
  return (
    <ErrorBoundary fullPage>
      <ThemeProvider>
        <PriceProvider>
          <HashRouter>
            <NetworkProvider>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="blocks" element={<BlocksPage />} />
                  <Route
                    path="block/:identifier"
                    element={<BlockDetailPage />}
                  />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route
                    path="transaction/:hash"
                    element={<TransactionDetailPage />}
                  />
                  <Route path="tx/:hash" element={<TransactionDetailPage />} />
                  <Route path="accounts" element={<AccountsPage />} />
                  <Route path="account/:publicKey" element={<AccountPage />} />
                  <Route path="staking" element={<StakingPage />} />
                  <Route path="zkapps" element={<ZkAppsPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="broadcast" element={<BroadcastPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </NetworkProvider>
          </HashRouter>
        </PriceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
