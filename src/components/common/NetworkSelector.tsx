import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useNetwork } from '@/hooks';
import { cn } from '@/lib/utils';

interface NetworkSelectorProps {
  inline?: boolean;
}

export function NetworkSelector({ inline }: NetworkSelectorProps): ReactNode {
  const {
    network,
    setNetwork,
    availableNetworks,
    customEndpoint,
    setCustomEndpoint,
  } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [inputValue, setInputValue] = useState(customEndpoint || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside (not needed for inline mode)
  useEffect(() => {
    if (inline) return;
    function handleClickOutside(event: MouseEvent): void {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowCustomInput(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inline]);

  const handleCustomSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (inputValue.trim()) {
      setCustomEndpoint(inputValue.trim());
      setShowCustomInput(false);
      setIsOpen(false);
    }
  };

  const handleClearCustom = (): void => {
    setCustomEndpoint(null);
    setInputValue('');
  };

  const handleNetworkSelect = (networkId: string): void => {
    setNetwork(networkId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        data-testid={
          inline ? 'mobile-network-selector' : 'desktop-network-selector'
        }
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        onClick={() => setIsOpen(!isOpen)}
      >
        {network.displayName}
        {network.isTestnet && (
          <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
            Testnet
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn('transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'rounded-md border border-border bg-popover p-1',
            inline
              ? 'mt-2'
              : 'absolute right-0 top-full z-50 mt-2 min-w-[280px] shadow-lg',
          )}
        >
          {availableNetworks.map(net => (
            <button
              key={net.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent',
                net.id === network.id &&
                  !customEndpoint &&
                  'bg-accent font-medium',
              )}
              onClick={() => handleNetworkSelect(net.id)}
            >
              {net.displayName}
              {net.isTestnet && (
                <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                  Testnet
                </span>
              )}
            </button>
          ))}

          <div className="my-1 h-px bg-border" />

          {customEndpoint && (
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span
                className="truncate text-xs text-muted-foreground"
                title={customEndpoint}
              >
                {customEndpoint}
              </span>
              <button
                className="rounded p-1 text-destructive hover:bg-destructive/10"
                onClick={handleClearCustom}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {showCustomInput ? (
            <div className="px-3 py-2">
              <form onSubmit={handleCustomSubmit}>
                <div className="flex gap-2">
                  <input
                    type="url"
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="https://archive-node.example.com"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    autoFocus
                  />
                  <button
                    className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    type="submit"
                  >
                    Set
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter GraphQL endpoint URL
                </p>
              </form>
            </div>
          ) : (
            <button
              className="w-full rounded-sm px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={e => {
                e.stopPropagation();
                setShowCustomInput(true);
              }}
            >
              Custom Endpoint...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
