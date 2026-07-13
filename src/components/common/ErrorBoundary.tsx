import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Full-viewport fallback for the top-level boundary. Omit for the
   * per-route boundary, which renders an inline card so the header, nav,
   * and footer stay usable and the user can navigate away.
   */
  fullPage?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a single bad component (or unexpected
 * API data shape) degrades to a recoverable card instead of unmounting the
 * whole app to a blank page. Note: this cannot catch errors thrown at module
 * load — those are handled by making storage access safe (see safeStorage).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for debugging; the boundary itself handles recovery.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const message =
      'An unexpected error occurred while rendering this view. Reloading usually fixes it — if it keeps happening, please report it.';

    const actions = (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={this.handleReload}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RotateCw size={16} />
          Reload page
        </button>
        <a
          href="#/"
          className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Home size={16} />
          Go to homepage
        </a>
      </div>
    );

    if (this.props.fullPage) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center text-foreground">
          <AlertTriangle size={40} className="text-destructive" />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {message}
            </p>
          </div>
          {actions}
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-destructive" />
        <h2 className="mt-3 text-lg font-semibold">This page hit an error</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {message}
        </p>
        <div className="mt-5">{actions}</div>
      </div>
    );
  }
}
