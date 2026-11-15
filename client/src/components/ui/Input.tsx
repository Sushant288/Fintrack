// M0: UI Input Component
import React from 'react';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  return <input className="border rounded p-2" {...props} />;
};
