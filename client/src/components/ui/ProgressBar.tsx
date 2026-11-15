// M0: UI Progress Bar Component
import React from 'react';

export const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div className="w-full bg-gray-200 h-2 rounded">
      <div className="bg-blue-600 h-2 rounded" style={{ width: `${progress}%` }} />
    </div>
  );
};
