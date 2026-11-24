import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report internal render error without leaking user passwords or sensitive tokens
    console.error('Uncaught error caught by ErrorBoundary:', error.message, errorInfo.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-paper text-ink">
          <div className="max-w-md w-full p-8 bg-panel border border-hairline rounded-md text-center shadow-sm">
            <h1 className="text-xl font-heading font-semibold mb-2">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h1>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              An unexpected display error occurred. You can reload the page to continue.
            </p>
            <Button variant="primary" onClick={this.handleReset}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
