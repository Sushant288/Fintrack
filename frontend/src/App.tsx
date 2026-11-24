import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { PublicOnlyRoute } from '@/components/layout/PublicOnlyRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/Skeleton';

// Lazy-loaded pages
const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('@/pages/Register').then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Categories = lazy(() => import('@/pages/Categories').then((m) => ({ default: m.Categories })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })));

const PageFallback: React.FC = () => (
  <div className="p-8 max-w-content mx-auto space-y-4">
    <Skeleton className="h-8 w-48 mb-6" />
    <Skeleton className="h-32 w-full mb-4" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export const App: React.FC = () => {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public-only authentication routes */}
        <Route
          path={ROUTES.LOGIN}
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path={ROUTES.REGISTER}
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />

        {/* Protected application routes wrapped in AppLayout */}
        <Route
          path={ROUTES.HOME}
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="categories" element={<Categories />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
