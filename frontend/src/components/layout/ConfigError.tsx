import React from 'react';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';

export const ConfigError: React.FC<{ error: z.ZodError }> = ({ error }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper text-ink">
      <div className="max-w-lg w-full p-8 bg-panel border-2 border-danger rounded-md shadow-md">
        <div className="flex items-center gap-3 text-danger mb-4">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <h1 className="text-xl font-heading font-semibold">Configuration Error</h1>
        </div>
        <p className="text-sm text-muted mb-4 leading-relaxed">
          FinTrack cannot start because one or more required environment variables are missing or invalid:
        </p>
        <ul className="space-y-2 p-3 bg-paper border border-hairline rounded-sm font-mono text-xs text-danger mb-6">
          {error.errors.map((err, idx) => (
            <li key={idx}>
              <strong>{err.path.join('.') || 'VITE_API_URL'}</strong>: {err.message}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Please check your <code className="bg-hairline px-1 py-0.5 rounded">.env</code> file and restart the development server.
        </p>
      </div>
    </div>
  );
};
