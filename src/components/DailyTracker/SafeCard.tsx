'use client';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown when the card throws. Defaults to a subtle inline message. */
  fallback?: ReactNode;
}

interface State { hasError: boolean }

export class SafeCard extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[SafeCard]', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-400 text-center">
            This section couldn&apos;t load — refresh if the problem persists.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
