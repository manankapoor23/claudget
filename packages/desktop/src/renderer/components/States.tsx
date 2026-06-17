import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';

export function LoadingState({ message = 'Loading usage…' }: { message?: string }): JSX.Element {
  return (
    <div className="center-state">
      <div className="spinner" />
      <div>{message}</div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="center-state">
      <div>{message}</div>
      {onRetry ? (
        <button className="btn" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div className="center-state">
      <div>{message}</div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time exceptions so a single bad field can't blank the widget. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Widget render error:', error, info.componentStack);
  }

  private readonly reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <ErrorState message={error.message} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
