// M0/Phase 1: Performance Dataset Seed and Benchmarking Script
import { PrismaClient, TxType, GoalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_CATEGORIES } from '../src/services/category.defaults';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isCleanup = args.includes('--cleanup');

  if (isCleanup) {
    console.log('--- Cleaning up perf@fintrack.dev user graph ---');
    const perfUser = await prisma.user.findUnique({ where: { email: 'perf@fintrack.dev' } });
    if (perfUser) {
      await prisma.user.delete({ where: { id: perfUser.id } });
      console.log('perf@fintrack.dev deleted successfully.');
    } else {
      console.log('perf@fintrack.dev does not exist.');
    }
    return;
  }

  // Parse target transaction count (default: 10,000)
  let count = 10000;
  for (const arg of args) {
    if (!arg.startsWith('-') && !isNaN(Number(arg))) {
      count = Number(arg);
      break;
    }
  }

  console.log(`======================================================`);
  console.log(`   FinTrack Performance Benchmark (N = ${count.toLocaleString()})`);
  console.log(`======================================================\n`);

  // 1. Create or reuse perf user
  let user = await prisma.user.findUnique({ where: { email: 'perf@fintrack.dev' } });
  if (!user) {
    console.log('Creating perf@fintrack.dev user...');
    user = await prisma.user.create({
      data: {
        name: 'Performance User',
        email: 'perf@fintrack.dev',
        passwordHash: bcrypt.hashSync('PerfPass123', 10),
        currency: 'INR',
        timezone: 'Asia/Kolkata'
      }
    });
  }

  // 2. Ensure default categories exist for perf user
  const existingCats = await prisma.category.findMany({ where: { userId: user.id } });
  if (existingCats.length === 0) {
    console.log('Creating default categories for perf user...');
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.create({
        data: {
          userId: user.id,
          name: cat.name,
          type: cat.type as TxType,
          color: cat.color,
          icon: cat.icon,
          isDefault: true
        }
      });
    }
  }

  const expenseCategories = await prisma.category.findMany({
    where: { userId: user.id, type: TxType.EXPENSE },
    select: { id: true }
  });
  const incomeCategories = await prisma.category.findMany({
    where: { userId: user.id, type: TxType.INCOME },
    select: { id: true }
  });

  const expenseCatIds = expenseCategories.map((c) => c.id);
  const incomeCatIds = incomeCategories.map((c) => c.id);

  // Create a sample budget for the current month if none exists
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  await prisma.budget.upsert({
    where: {
      userId_categoryId_month_year: {
        userId: user.id,
        categoryId: expenseCatIds[0],
        month: currentMonth,
        year: currentYear
      }
    },
    update: {},
    create: {
      userId: user.id,
      categoryId: expenseCatIds[0],
      type: TxType.EXPENSE,
      month: currentMonth,
      year: currentYear,
      amount: '50000.00'
    }
  });

  // 3. Batch insert N transactions spread over 3 years (1095 days)
  console.log(`Inserting ${count.toLocaleString()} transactions in batches...`);
  const batchSize = 25000;
  const batches = Math.ceil(count / batchSize);
  const startTime = Date.now();

  for (let b = 0; b < batches; b++) {
    const startIdx = b * batchSize + 1;
    const endIdx = Math.min((b + 1) * batchSize, count);
    const thisBatchCount = endIdx - startIdx + 1;

    await prisma.$executeRaw`
      INSERT INTO "Transaction" ("id", "userId", "categoryId", "type", "amount", "date", "description", "paymentMethod", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid(),
        ${user.id},
        CASE
          WHEN (s % 100) < 15 THEN (${incomeCatIds}::text[])[(s % array_length(${incomeCatIds}::text[], 1)) + 1]
          ELSE (${expenseCatIds}::text[])[(s % array_length(${expenseCatIds}::text[], 1)) + 1]
        END,
        CASE
          WHEN (s % 100) < 15 THEN 'INCOME'::"TxType"
          ELSE 'EXPENSE'::"TxType"
        END,
        ROUND(((random() * 4999.00) + 1.00)::numeric, 2),
        (CURRENT_DATE - (s % 1095)::integer),
        'Perf transaction #' || s,
        'CARD'::"PaymentMethod",
        NOW(),
        NOW()
      FROM generate_series(${startIdx}, ${endIdx}) AS s;
    `;
    console.log(`  -> Inserted batch ${b + 1}/${batches} (${thisBatchCount} rows)`);
  }

  const insertDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Inserted ${count.toLocaleString()} transactions in ${insertDuration}s.`);

  // 4. Run ANALYZE on Transaction table
  console.log('\nRunning ANALYZE "Transaction"...');
  await prisma.$executeRawUnsafe('ANALYZE "Transaction";');

  // 5. Benchmark 5 Critical Queries using EXPLAIN (ANALYZE, BUFFERS)
  console.log('\n--- Benchmarking 5 Production Query Plans ---\n');

  interface BenchResult {
    name: string;
    execTimeMs: number;
    usesIndex: boolean;
    planSummary: string;
  }

  const benchResults: BenchResult[] = [];

  const startDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const endDate = new Date(Date.UTC(currentYear, currentMonth, 1));
  const twelveMonthsAgo = new Date(Date.UTC(currentYear - 1, currentMonth - 1, 1));
  const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 1));

  function parseExplain(rows: any[]): { execTime: number; usesIndex: boolean; summary: string } {
    const lines = rows.map((r) => Object.values(r)[0] as string);
    let execTime = 0;
    let usesIndex = false;
    let summary = lines[0] || '';

    for (const line of lines) {
      if (line.includes('Index Scan') || line.includes('Index Only Scan') || line.includes('Bitmap Index Scan')) {
        usesIndex = true;
      }
      const match = line.match(/Execution Time: ([\d.]+) ms/);
      if (match) {
        execTime = parseFloat(match[1]);
      }
    }
    return { execTime, usesIndex, summary };
  }

  // Query 1: Period summary (SUM FILTER)
  const q1Plan: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      COUNT(*) as tx_count,
      COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as total_expense
    FROM "Transaction"
    WHERE "userId" = ${user.id}
      AND "date" >= ${startDate}
      AND "date" <= ${endDate}
  `;
  const p1 = parseExplain(q1Plan);
  benchResults.push({ name: '1. Period Summary (SUM FILTER)', execTimeMs: p1.execTime, usesIndex: p1.usesIndex, planSummary: p1.summary });

  // Query 2: Expense by category with percent (Window function)
  const q2Plan: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      c.name as category_name,
      SUM(t.amount) as category_total,
      ROUND((SUM(t.amount) / SUM(SUM(t.amount)) OVER ()) * 100, 2) as pct
    FROM "Transaction" t
    JOIN "Category" c ON c.id = t."categoryId"
    WHERE t."userId" = ${user.id}
      AND t.type = 'EXPENSE'
      AND t."date" >= ${startDate}
      AND t."date" <= ${endDate}
    GROUP BY c.id, c.name
    ORDER BY category_total DESC
  `;
  const p2 = parseExplain(q2Plan);
  benchResults.push({ name: '2. Expense By Category (Window Func)', execTimeMs: p2.execTime, usesIndex: p2.usesIndex, planSummary: p2.summary });

  // Query 3: Monthly trend over 12 months (date_trunc)
  const q3Plan: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      date_trunc('month', "date") as month_start,
      COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as expense
    FROM "Transaction"
    WHERE "userId" = ${user.id}
      AND "date" >= ${twelveMonthsAgo}
    GROUP BY date_trunc('month', "date")
    ORDER BY month_start ASC
  `;
  const p3 = parseExplain(q3Plan);
  benchResults.push({ name: '3. Monthly Trend (12 Months)', execTimeMs: p3.execTime, usesIndex: p3.usesIndex, planSummary: p3.summary });

  // Query 4: Running cumulative balance
  const q4Plan: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      id,
      date,
      amount,
      type,
      SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END)
        OVER (PARTITION BY "userId" ORDER BY date, id) as running_balance
    FROM "Transaction"
    WHERE "userId" = ${user.id}
      AND "date" >= ${startDate}
    ORDER BY date, id
    LIMIT 100
  `;
  const p4 = parseExplain(q4Plan);
  benchResults.push({ name: '4. Running Cumulative Balance', execTimeMs: p4.execTime, usesIndex: p4.usesIndex, planSummary: p4.summary });

  // Query 5: Budget vs actual for one month
  const q5Plan: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT
      b.id as budget_id,
      c.name as category_name,
      b.amount as budget_amount,
      COALESCE(SUM(t.amount), 0) as actual_spend,
      ROUND((COALESCE(SUM(t.amount), 0) / b.amount) * 100, 2) as pct_used
    FROM "Budget" b
    JOIN "Category" c ON c.id = b."categoryId"
    LEFT JOIN "Transaction" t ON t."userId" = b."userId"
      AND t."categoryId" = b."categoryId"
      AND t.type = 'EXPENSE'
      AND t."date" >= ${monthStart}
      AND t."date" < ${monthEnd}
    WHERE b."userId" = ${user.id}
      AND b.month = ${currentMonth}
      AND b.year = ${currentYear}
    GROUP BY b.id, c.name, b.amount
  `;
  const p5 = parseExplain(q5Plan);
  benchResults.push({ name: '5. Budget vs Actual (One Month)', execTimeMs: p5.execTime, usesIndex: p5.usesIndex, planSummary: p5.summary });

  // 6. Print Benchmark Summary Table
  console.log('------------------------------------------------------------------------------------------------');
  console.log('| Query                                    | Exec Time (ms) | Uses Index | Plan Summary         |');
  console.log('------------------------------------------------------------------------------------------------');
  let totalExecTime = 0;
  let allUnder300 = true;

  for (const b of benchResults) {
    totalExecTime += b.execTimeMs;
    if (b.execTimeMs >= 300) allUnder300 = false;
    const nameStr = b.name.padEnd(40, ' ');
    const timeStr = `${b.execTimeMs.toFixed(2)} ms`.padStart(14, ' ');
    const idxStr = (b.usesIndex ? 'YES' : 'NO').padEnd(10, ' ');
    const planSnippet = b.planSummary.slice(0, 20).padEnd(20, ' ');
    console.log(`| ${nameStr} | ${timeStr} | ${idxStr} | ${planSnippet} |`);
  }
  console.log('------------------------------------------------------------------------------------------------');
  console.log(`Total Execution Time (5 queries): ${totalExecTime.toFixed(2)} ms\n`);

  // 7. Final Verdict: PASS if each query < 300ms and total < 2000ms
  const isPass = allUnder300 && totalExecTime < 2000;
  if (isPass) {
    console.log(`\x1b[32m[VERDICT: PASS]\x1b[0m All 5 queries completed under 300 ms each and total under 2000 ms.`);
  } else {
    console.log(`\x1b[31m[VERDICT: FAIL]\x1b[0m Performance threshold not met. (Target: each < 300ms, total < 2000ms).`);
  }
}

main()
  .catch((e) => {
    console.error('Performance seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
