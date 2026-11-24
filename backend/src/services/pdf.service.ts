import PDFDocument from 'pdfkit';

export interface ReportCategoryItem {
  id: string;
  name: string;
  amount: string;
  percentage: number;
}

export interface ReportBudgetItem {
  categoryName: string;
  budgeted: string;
  actual: string;
  remaining: string;
  percentUsed: number;
  status: 'OK' | 'WARNING' | 'EXCEEDED';
}

export interface MonthlyReportSnapshotData {
  user: {
    id: string;
    name: string;
    email: string;
    currency: string;
  };
  period: {
    year: number;
    month: number;
    label: string;
    from: string;
    to: string;
  };
  summary: {
    income: string;
    expense: string;
    netSavings: string;
    savingsRate: number | null;
    transactionsCount: number;
  };
  categories: ReportCategoryItem[];
  budgets: ReportBudgetItem[];
  generatedAt: string;
}

/**
 * Strips characters outside standard Latin-1/ASCII to protect PDFKit built-in Helvetica font.
 */
function safePdfText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .trim();
}

/**
 * Builds an on-demand PDF report for a monthly financial summary using PDFKit.
 */
export function generateReportPdfBuffer(data: MonthlyReportSnapshotData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      info: {
        Title: `FinTrack Monthly Report - ${data.period.label}`,
        Author: 'FinTrack',
        Creator: 'FinTrack Automated Reporting Engine'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const currency = safePdfText(data.user.currency);

    // Header & Title
    doc
      .fillColor('#0f172a')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('FinTrack Financial Report', { align: 'left' });

    doc
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#64748b')
      .text(`Period: ${safePdfText(data.period.label)} (${data.period.from} to ${data.period.to})`)
      .text(`Account Holder: ${safePdfText(data.user.name)} <${safePdfText(data.user.email)}>`)
      .moveDown(1.5);

    // Summary Card Box
    const boxTop = doc.y;
    doc
      .roundedRect(40, boxTop, 515, 80, 4)
      .fillColor('#f8fafc')
      .fillAndStroke('#f8fafc', '#e2e8f0');

    doc.fillColor('#0f172a');
    const colWidth = 125;
    const padY = boxTop + 15;

    // Col 1: Total Income
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('TOTAL INCOME', 55, padY);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#16a34a').text(`${currency} ${data.summary.income}`, 55, padY + 16);

    // Col 2: Total Expenses
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('TOTAL EXPENSES', 55 + colWidth, padY);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#dc2626').text(`${currency} ${data.summary.expense}`, 55 + colWidth, padY + 16);

    // Col 3: Net Savings
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('NET SAVINGS', 55 + colWidth * 2, padY);
    const netSavingsNum = Number(data.summary.netSavings);
    const netColor = netSavingsNum >= 0 ? '#16a34a' : '#dc2626';
    doc.fontSize(14).font('Helvetica-Bold').fillColor(netColor).text(`${currency} ${data.summary.netSavings}`, 55 + colWidth * 2, padY + 16);

    // Col 4: Savings Rate
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('SAVINGS RATE', 55 + colWidth * 3, padY);
    const rateText = data.summary.savingsRate !== null ? `${data.summary.savingsRate}%` : 'N/A';
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text(rateText, 55 + colWidth * 3, padY + 16);

    doc.y = boxTop + 105;

    // Section 1: Expense Breakdown by Category
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Top Expense Categories').moveDown(0.5);

    if (data.categories.length === 0) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#94a3b8').text('No recorded expenses for this period.').moveDown(1);
    } else {
      // Table Header
      const tableY = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
      doc.text('CATEGORY', 40, tableY);
      doc.text('AMOUNT', 360, tableY, { width: 100, align: 'right' });
      doc.text('SHARE', 470, tableY, { width: 85, align: 'right' });

      doc.moveTo(40, tableY + 14).lineTo(555, tableY + 14).strokeColor('#cbd5e1').stroke();
      doc.y = tableY + 20;

      for (const cat of data.categories) {
        const rowY = doc.y;
        doc.fontSize(9).font('Helvetica').fillColor('#1e293b');
        doc.text(safePdfText(cat.name), 40, rowY);
        doc.text(`${currency} ${cat.amount}`, 360, rowY, { width: 100, align: 'right' });
        doc.text(`${cat.percentage.toFixed(1)}%`, 470, rowY, { width: 85, align: 'right' });
        doc.y = rowY + 16;
      }
      doc.moveDown(1.5);
    }

    // Section 2: Budget vs Actual Performance
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Budget Performance').moveDown(0.5);

    if (data.budgets.length === 0) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#94a3b8').text('No active budgets defined for this month.').moveDown(1);
    } else {
      const budgetTableY = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
      doc.text('CATEGORY', 40, budgetTableY);
      doc.text('BUDGETED', 220, budgetTableY, { width: 80, align: 'right' });
      doc.text('ACTUAL', 310, budgetTableY, { width: 80, align: 'right' });
      doc.text('REMAINING', 400, budgetTableY, { width: 80, align: 'right' });
      doc.text('STATUS', 490, budgetTableY, { width: 65, align: 'right' });

      doc.moveTo(40, budgetTableY + 14).lineTo(555, budgetTableY + 14).strokeColor('#cbd5e1').stroke();
      doc.y = budgetTableY + 20;

      for (const b of data.budgets) {
        const rowY = doc.y;
        doc.fontSize(9).font('Helvetica').fillColor('#1e293b');
        doc.text(safePdfText(b.categoryName), 40, rowY);
        doc.text(`${currency} ${b.budgeted}`, 220, rowY, { width: 80, align: 'right' });
        doc.text(`${currency} ${b.actual}`, 310, rowY, { width: 80, align: 'right' });
        doc.text(`${currency} ${b.remaining}`, 400, rowY, { width: 80, align: 'right' });

        let statusColor = '#16a34a';
        if (b.status === 'WARNING') statusColor = '#d97706';
        if (b.status === 'EXCEEDED') statusColor = '#dc2626';

        doc.fillColor(statusColor).font('Helvetica-Bold').text(b.status, 490, rowY, { width: 65, align: 'right' });
        doc.y = rowY + 16;
      }
    }

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#94a3b8')
      .text(
        `Generated on ${data.generatedAt} | FinTrack Personal Finance | Total Transactions: ${data.summary.transactionsCount}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  });
}
