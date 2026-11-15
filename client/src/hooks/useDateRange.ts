// M6: useDateRange hook
import { useContext } from 'react';
import { DateRangeContext } from '../context/DateRangeContext';

export const useDateRange = () => useContext(DateRangeContext);
