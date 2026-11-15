// M0: UI Button Component
import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => {
  return <button className="px-4 py-2 rounded bg-blue-600 text-white" {...props}>{children}</button>;
};
