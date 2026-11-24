import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';

export const NotFound: React.FC = () => {
  usePageTitle('Page not found');

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <span className="text-xs font-mono font-semibold uppercase text-muted tracking-widest mb-2">
        Error 404
      </span>
      <h1 className="text-3xl font-heading font-semibold text-ink mb-2">Page Not Found</h1>
      <p className="text-sm text-muted max-w-sm mb-6">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Link to={ROUTES.HOME}>
        <Button variant="primary">Return to dashboard</Button>
      </Link>
    </div>
  );
};
