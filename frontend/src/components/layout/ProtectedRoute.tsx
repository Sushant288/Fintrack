import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes';
import { Skeleton } from '@/components/ui/Skeleton';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'bootstrapping') {
    return (
      <div className="p-8 max-w-content mx-auto space-y-4">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    const returnTo = location.pathname + location.search;
    return <Navigate to={ROUTES.LOGIN} state={{ returnTo }} replace />;
  }

  return <>{children}</>;
};
