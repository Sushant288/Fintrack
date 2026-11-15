// M0: UI Empty State Component
import React from 'react';

export const EmptyState: React.FC<{ title: string; description?: string }> = ({ title, description }) => {
  return (
    <div className="text-center p-8 text-gray-500">
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="text-sm mt-1">{description}</p>}
    </div>
  );
};
