// M0: UI Modal Component
import React from 'react';

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode }> = ({ isOpen, children }) => {
  if (!isOpen) return null;
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center">{children}</div>;
};
