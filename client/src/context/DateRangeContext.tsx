// M6: DateRange Context
import React, { createContext, useState } from 'react';

export const DateRangeContext = createContext<any>(null);

export const DateRangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
};
