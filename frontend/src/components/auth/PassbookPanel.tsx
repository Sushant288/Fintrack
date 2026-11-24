import React, { useMemo } from 'react';
import { formatMoney, formatDate } from '@/utils/formatters';

export const PassbookPanel: React.FC = () => {
  // Generate illustrative relative sample entries using standard Intl
  const sampleEntries = useMemo(() => {
    const today = new Date();
    const d1 = new Date(today.getTime() - 4 * 86400000);
    const d2 = new Date(today.getTime() - 2 * 86400000);
    const d3 = new Date(today.getTime() - 1 * 86400000);

    return [
      { date: formatDate(d1), desc: 'Initial Deposit', amount: '+2,450.00', balance: '2,450.00', type: 'in' },
      { date: formatDate(d2), desc: 'Grocery Market', amount: '-84.20', balance: '2,365.80', type: 'out' },
      { date: formatDate(d3), desc: 'Utility Bill (Electric)', amount: '-112.50', balance: '2,253.30', type: 'out' },
      { date: formatDate(today), desc: 'Freelance Design', amount: '+650.00', balance: '2,903.30', type: 'in' }
    ];
  }, []);

  return (
    <div
      aria-hidden="true"
      className="passbook-reveal max-w-md w-full bg-panel border border-hairline rounded-lg shadow-sm p-8 relative overflow-hidden select-none"
    >
      {/* Passbook header */}
      <div className="border-b border-hairline pb-4 mb-6 flex items-center justify-between">
        <div>
          <span className="text-xs font-mono tracking-wider uppercase text-muted">Passbook No.</span>
          <p className="font-heading font-semibold text-ink text-base">FT-80492-PASS</p>
        </div>
        {/* Marigold stamp */}
        <div className="border-2 border-marigold text-marigold font-heading font-bold text-[10px] tracking-widest uppercase px-2 py-1 rounded-sm rotate-[-6deg] opacity-90">
          FinTrack Verified
        </div>
      </div>

      {/* Ledger ruled table */}
      <div className="passbook-ruled space-y-4 font-mono text-xs">
        <div className="grid grid-cols-12 text-muted font-medium pb-1 border-b border-hairline/60">
          <span className="col-span-3">Date</span>
          <span className="col-span-4">Particulars</span>
          <span className="col-span-2 text-right">Amount</span>
          <span className="col-span-3 text-right">Balance</span>
        </div>

        {sampleEntries.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 items-center text-ink/90 tabular-nums py-1">
            <span className="col-span-3 text-muted">{row.date}</span>
            <span className="col-span-4 truncate font-sans text-xs">{row.desc}</span>
            <span
              className={`col-span-2 text-right font-medium ${
                row.type === 'in' ? 'text-income' : 'text-expense'
              }`}
            >
              {row.amount}
            </span>
            <span className="col-span-3 text-right font-semibold text-ink">{row.balance}</span>
          </div>
        ))}
      </div>

      {/* Passbook footer summary */}
      <div className="mt-8 pt-4 border-t border-hairline flex items-center justify-between text-xs text-muted">
        <span>Running Total: {formatMoney('2903.30')}</span>
        <span className="font-mono">Page 01 of 12</span>
      </div>
    </div>
  );
};
