import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any render error unmounts the whole app and leaves a blank
 * white screen with no way out — which is exactly what a malformed model
 * response used to cause. Show something recoverable instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center dark:bg-[#0D0D0D]">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg dark:bg-[#1C1C1E]">
          <h1 className="mb-2 text-xl font-bold text-brand-dark dark:text-white">
            Something went wrong
          </h1>
          <p className="mb-6 text-gray-600 dark:text-[#A1A1AA]">
            We couldn't display this medication. Please try searching again.
          </p>
          <button
            onClick={this.handleReset}
            className="w-full rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-secondary dark:bg-[#90E0EF] dark:text-[#0D0D0D]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
