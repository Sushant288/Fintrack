// M0: UI Confirmation Dialog Component
import React from 'react';

export const ConfirmDialog: React.FC<{ isOpen: boolean; onConfirm: () => void; onCancel: () => void }> = ({ isOpen }) => {
  if (!isOpen) return null;
  return <div>Confirm Dialog</div>;
};
