import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';

/** A placeholder block with a gentle shimmer, shaped like what's coming. */
function Bone({ w, h, r = 4 }: { w: string | number; h: number; r?: number }): JSX.Element {
  return <span className="bone" style={{ width: w, height: h, borderRadius: r }} />;
}

/** Stands in for the limit rows until the first reading arrives. */
export function LimitsSkeleton(): JSX.Element {
  return (
    <div className="skel" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="skel__lim">
          <div className="skel__row">
            <Bone w={i === 0 ? 72 : 56} h={12} />
            <Bone w={i === 0 ? 64 : 44} h={i === 0 ? 30 : 20} r={6} />
          </div>
          <Bone w="100%" h={8} r={999} />
          <Bone w={84} h={10} />
        </div>
      ))}
    </div>
  );
}

/** The overview's shape — limits, figures, chart — while the first scan runs. */
export function LoadingState({
  message = 'Reading your usage…',
}: {
  message?: string;
}): JSX.Element {
  return (
    <div className="skel skel--page" role="status" aria-label={message}>
      <LimitsSkeleton />
      <div className="skel__figs">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel__fig">
            <Bone w={56} h={18} r={5} />
            <Bone w={40} h={10} />
          </div>
        ))}
      </div>
      <Bone w="100%" h={72} r={6} />
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
