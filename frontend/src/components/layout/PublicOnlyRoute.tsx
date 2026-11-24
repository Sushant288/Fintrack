import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes';
import { Skeleton } from '@/components/ui/Skeleton';

export const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'bootstrapping') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
        <div className="max-w-md w-full space-y-4">
          <Skeleton className="h-10 w-32 mx-auto" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
};
