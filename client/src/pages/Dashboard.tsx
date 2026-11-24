import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ROUTES } from '@/config/routes';
import { Tag, Settings, ArrowRight } from 'lucide-react';

/**
 * Minimal placeholder Dashboard for Module F1.
 * Fully replaced in Module F4 with analytics, cashflow trends, charts, and activity summaries.
 */
export const Dashboard: React.FC = () => {
  usePageTitle('Dashboard');
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-panel border border-hairline rounded-md p-6 sm:p-8">
        <h1 className="text-2xl font-heading font-semibold text-ink mb-1">
          Hello, {user?.name || 'there'}
        </h1>
        <p className="text-sm text-muted max-w-xl">
          Welcome to your FinTrack personal finance passbook. In this foundation module, your core identity, categories, and account settings are ready.
        </p>
      </div>

      {/* Quick navigation to F1 enabled sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to={ROUTES.CATEGORIES}
          className="flex items-start justify-between p-5 bg-panel border border-hairline rounded-md hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-sm bg-primary/10 text-primary">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-heading text-ink group-hover:text-primary transition-colors">
                Categories
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Organize your income and expenses with 2-level hierarchical categories.
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors mt-1" />
        </Link>

        <Link
          to={ROUTES.SETTINGS}
          className="flex items-start justify-between p-5 bg-panel border border-hairline rounded-md hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-sm bg-primary/10 text-primary">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-heading text-ink group-hover:text-primary transition-colors">
                Settings
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Manage profile, currency, time zone, alert thresholds, and security.
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors mt-1" />
        </Link>
      </div>
    </div>
  );
};
