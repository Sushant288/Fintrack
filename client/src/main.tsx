import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getEnvError } from '@/config/env';
import { TIMING } from '@/config/timing';
import { ApiClientError } from '@/api/errors';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ConfigError } from '@/components/layout/ConfigError';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider } from '@/context/AuthContext';
import App from '@/App';
import '@/styles/index.css';

// 1. Check for environment validation errors on startup
const envErr = getEnvError();
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

if (envErr) {
  root.render(<ConfigError error={envErr} />);
} else {
  // 2. Configure React Query client with secure defaults
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIMING.QUERY_STALE_TIME_MS,
        gcTime: TIMING.QUERY_GC_TIME_MS,
        retry: (failureCount, error) => {
          // Never retry 4xx errors
          if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
            return false;
          }
          // Retry network or 5xx with bounded count
          return failureCount < TIMING.MAX_RETRY_COUNT;
        },
        refetchOnWindowFocus: true
      },
      mutations: {
        retry: false
      }
    }
  });

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <BrowserRouter>
                <AuthProvider>
                  <App />
                </AuthProvider>
              </BrowserRouter>
            </ToastProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
