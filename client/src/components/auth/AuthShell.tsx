import React from 'react';
import { PassbookPanel } from './PassbookPanel';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Toaster } from '@/components/ui/Toaster';

export interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-screen flex bg-paper text-ink">
      {/* Decorative passbook side panel for wide screens */}
      <div className="hidden lg:flex lg:w-1/2 p-8 lg:p-12 items-center justify-center border-r border-hairline bg-panel/40">
        <PassbookPanel />
      </div>

      {/* Auth form container */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 lg:p-14">
        {/* Top header with brand and theme toggle */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-sm bg-primary text-[var(--color-primary-contrast)] flex items-center justify-center font-heading font-bold text-sm">
              F
            </div>
            <span className="font-heading font-semibold text-lg tracking-tight">FinTrack</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Center content */}
        <main className="max-w-form w-full mx-auto my-8">
          <div className="mb-6">
            <h1 className="text-2xl font-heading font-semibold text-ink tracking-tight mb-1">
              {title}
            </h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          {children}
        </main>

        {/* Footer */}
        <footer className="text-xs text-muted text-center sm:text-left">
          &copy; {new Date().getFullYear()} FinTrack. Calm, trustworthy, number-first personal finance.
        </footer>
      </div>

      <Toaster />
    </div>
  );
};
