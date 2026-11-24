import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Toaster } from '@/components/ui/Toaster';
import { useAuth } from '@/hooks/useAuth';

export const AppLayout: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const { bannerError, retryBootstrap } = useAuth();

  return (
    <div className="min-h-screen flex bg-paper text-ink">
      {/* Accessibility skip to content link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Non-blocking banner error */}
      {bannerError && (
        <div
          role="alert"
          className="fixed top-0 left-0 right-0 z-50 bg-danger text-white px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between"
        >
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => retryBootstrap()}
            className="underline ml-4 hover:opacity-90 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onToggleSidebar={() => setIsOpenMobile(true)} />
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8 outline-none">
          <div className="max-w-content mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Toasts Region */}
      <Toaster />
    </div>
  );
};
