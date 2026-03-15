import { Component, ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.icon}>⚠️</div>
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.message}>
              We're sorry, but something unexpected happened. Please try again.
            </p>
            {this.state.error && (
              <details className={styles.details}>
                <summary>Error details</summary>
                <pre>{this.state.error.message}</pre>
              </details>
            )}
            <div className={styles.actions}>
              <button onClick={this.handleRetry} className={styles.primaryBtn}>
                Go to Home
              </button>
              <button onClick={() => window.location.reload()} className={styles.secondaryBtn}>
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
