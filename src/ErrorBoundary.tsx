import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur React interceptée par ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, #163420 0%, #0a1810 55%, #050c07 100%)',
          }}
        >
          <div className="max-w-md flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-red-300">⚠️ Une erreur est survenue</h2>
            <p className="text-sm text-neutral-300">
              L'application a rencontré un problème inattendu au lieu de planter silencieusement. Essaie de recharger
              la page.
            </p>
            <pre className="text-left text-xs text-neutral-400 bg-black/30 rounded-lg p-3 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl font-bold bg-green-400 text-black"
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
