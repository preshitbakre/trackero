import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '../ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-paper p-6">
          <div className="rounded-lg shadow-sm bg-white p-8 max-w-md w-full text-center">
            <div className="text-[32px] mb-3">&#x26A0;</div>
            <h1 className="text-[20px] font-medium text-neutral-700 mb-2">
              Something went wrong
            </h1>
            <p className="text-[16px] text-neutral-500 mb-6">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <div className="flex justify-center">
              <Button variant="primary" onClick={this.handleReload}>
                Refresh page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
