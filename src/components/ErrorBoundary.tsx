import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render-time crash in one card must not blank the whole dashboard, and report data
 * comes from files this app does not write, so a surprise shape is always possible.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[reporto] render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="panel">
        <p className="status error">This view failed to render: {error.message}</p>
        <p className="foot">
          The report file is probably malformed. Press an update button to regenerate it,
          then reload.
        </p>
      </div>
    );
  }
}
