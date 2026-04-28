import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  // Optional label so error UI can name the section that failed.
  label?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught render error", error, errorInfo);
  }

  private reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label || "this page";
    return (
      <div className="min-h-screen bg-background flex items-start justify-center px-4 py-12" data-testid="error-boundary-fallback">
        <div className="max-w-2xl w-full space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="font-serif text-xl font-bold">Something went wrong rendering {label}.</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error. The details below will help us fix it — please share them with the team.
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-mono text-foreground" data-testid="error-boundary-message">
              {error.name}: {error.message}
            </div>
            {error.stack && (
              <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words max-h-64 overflow-auto" data-testid="error-boundary-stack">
                {error.stack}
              </pre>
            )}
            {errorInfo?.componentStack && (
              <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-auto" data-testid="error-boundary-component-stack">
                {errorInfo.componentStack}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={this.reset} size="sm" data-testid="button-error-retry">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
            </Button>
            <Button onClick={() => window.location.reload()} size="sm" variant="outline" data-testid="button-error-reload">
              Reload page
            </Button>
            <Button onClick={() => (window.location.href = "/")} size="sm" variant="ghost" data-testid="button-error-home">
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
