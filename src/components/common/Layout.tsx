import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Disclaimer } from './Disclaimer';
import { Footer } from './Footer';

export function Layout(): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <Disclaimer />
      <main className="container mx-auto grow px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
