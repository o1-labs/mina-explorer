import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { NetworkSelector } from './NetworkSelector';
import { ThemeToggle } from './ThemeToggle';
import { PriceDisplay } from './PriceDisplay';
import { cn } from '@/lib/utils';

export function Header(): ReactNode {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo - dark.svg has white fill for dark mode, light.svg has dark fill for light mode */}
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src={`${import.meta.env.BASE_URL}mina-logo-dark.svg`}
              alt="Mina Explorer"
              height="24"
              className="hidden h-6 dark:block"
            />
            <img
              src={`${import.meta.env.BASE_URL}mina-logo-light.svg`}
              alt="Mina Explorer"
              height="24"
              className="h-6 dark:hidden"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-4 lg:flex">
            <Link
              to="/blocks"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Blocks
            </Link>
            <Link
              to="/transactions"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Transactions
            </Link>
            <Link
              to="/accounts"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Accounts
            </Link>
            <Link
              to="/staking"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Staking
            </Link>
            <Link
              to="/zkapps"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              zkApps
            </Link>
            <Link
              to="/analytics"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Analytics
            </Link>
            <Link
              to="/broadcast"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Broadcast
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <PriceDisplay />
            <SearchBar />
            <ThemeToggle />
            <NetworkSelector />
          </div>

          {/* Mobile Menu Button */}
          <button
            data-testid="mobile-menu-button"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 lg:hidden',
            mobileMenuOpen
              ? 'max-h-[calc(100dvh-4rem)] overflow-y-auto pb-4'
              : 'max-h-0',
          )}
        >
          <nav className="flex flex-col gap-2 pt-2">
            <Link
              to="/blocks"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Blocks
            </Link>
            <Link
              to="/transactions"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Transactions
            </Link>
            <Link
              to="/accounts"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Accounts
            </Link>
            <Link
              to="/staking"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Staking
            </Link>
            <Link
              to="/zkapps"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              zkApps
            </Link>
            <Link
              to="/analytics"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Analytics
            </Link>
            <Link
              to="/broadcast"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              Broadcast
            </Link>
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <PriceDisplay />
            <SearchBar />
            <div className="flex items-center gap-3">
              <ThemeToggle />
            </div>
            <NetworkSelector inline />
          </div>
        </div>
      </div>
    </header>
  );
}
