import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Disclaimer } from './Disclaimer';
import { Footer } from './Footer';
import { ErrorBoundary } from './ErrorBoundary';

export function Layout(): ReactNode {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <Disclaimer />
      <main className="container mx-auto grow px-4 py-6">
        {/* Keyed on the path so navigating away from a crashed page recovers. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
