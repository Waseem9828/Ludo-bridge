import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected application error.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('LudoBridge render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#F8F7F4] px-4 py-12 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-surface-card text-center space-y-4">
            <h1 className="font-display text-xl font-bold text-[#16181D]">
              Unable to load LudoBridge
            </h1>
            <p className="text-xs text-[#5A606D] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-[#0D7A5F] px-5 py-2 text-xs font-bold text-white shadow-emerald-btn"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
