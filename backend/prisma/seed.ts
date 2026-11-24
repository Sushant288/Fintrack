// M0/Phase 1: Deterministic and Idempotent Database Seed Script
import { PrismaClient, TxType, PaymentMethod, Frequency, GoalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_CATEGORIES } from '../src/services/category.defaults';

const prisma = new PrismaClient();

// Seeded Pseudo-Random Number Generator (LCG) for deterministic reproducibility
class SeededRandom {
  private seed: number;
  constructor(seed = 123456789) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

async function main() {
  console.log('--- Starting FinTrack Database Seed ---');
  const rng = new SeededRandom(42);

  await prisma.$transaction(async (tx) => {
    // 1. Delete demo user if exists (cascade removes all associated data)
    const existingUser = await tx.user.findUnique({
      where: { email: 'demo@fintrack.dev' }
    });
    if (existingUser) {
      console.log('Cleaning up existing demo@fintrack.dev user graph...');
      await tx.user.delete({ where: { id: existingUser.id } });
    }

    // 2. Create Demo User
    console.log('Creating demo user...');
    const passwordHash = bcrypt.hashSync('Demo1234', 12);
    const user = await tx.user.create({
      data: {
        name: 'Demo User',
        email: 'demo@fintrack.dev',
        passwordHash,
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        alertThresholds: [80, 100],
        alertInAppEnabled: true,
        alertEmailEnabled: false
      }
    });

    // 3. Create Default Categories
    console.log('Creating default categories...');
    const categoryMap = new Map<string, string>(); // key: `${name}_${type}` -> id
    for (const cat of DEFAULT_CATEGORIES) {
      const created = await tx.category.create({
        data: {
          userId: user.id,
          name: cat.name,
          type: cat.type as TxType,
          color: cat.color,
          icon: cat.icon,
          isDefault: true,
          isArchived: false
        }
      });
      categoryMap.set(`${cat.name}_${cat.type}`, created.id);
    }

    // Determine target dates based on current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();

    // 3 months ago 1st day
    const startDate3MonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 4, 1));
    const nextRunDate = new Date(Date.UTC(currentYear, currentMonth, 1));

    // 5. RecurringRule: Rent, MONTHLY
    console.log('Setting up recurring rule for Rent...');
    const rentCategoryId = categoryMap.get('Rent_EXPENSE')!;
    const rentRule = await tx.recurringRule.create({
      data: {
        userId: user.id,
        categoryId: rentCategoryId,
        type: TxType.EXPENSE,
        amount: '18000.00',
        description: 'Monthly apartment rent',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        frequency: Frequency.MONTHLY,
        startDate: startDate3MonthsAgo,
        nextRunDate: nextRunDate,
        isActive: true,
        lastRunAt: new Date(Date.UTC(currentYear, currentMonth - 1, 1))
      }
    });

    // 4. Create Transactions for previous 3 months + current month up to today
    console.log('Generating deterministic transactions...');
    const salaryCatId = categoryMap.get('Salary_INCOME')!;
    const freelanceCatId = categoryMap.get('Freelance_INCOME')!;

    const paymentMethods = [
      PaymentMethod.CARD,
      PaymentMethod.UPI,
      PaymentMethod.CASH,
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.OTHER
    ];

    const expenseCategories = [
      { name: 'Food', type: 'EXPENSE', min: 150, max: 800 },
      { name: 'Transport', type: 'EXPENSE', min: 50, max: 400 },
      { name: 'Utilities', type: 'EXPENSE', min: 500, max: 2500 },
      { name: 'Entertainment', type: 'EXPENSE', min: 200, max: 1200 },
      { name: 'Shopping', type: 'EXPENSE', min: 300, max: 2000 },
      { name: 'Health', type: 'EXPENSE', min: 100, max: 1500 }
    ];

    for (let offset = 3; offset >= 0; offset--) {
      const monthIdx = currentMonth - 1 - offset;
      const targetDateYear = new Date(Date.UTC(currentYear, monthIdx, 1)).getFullYear();
      const targetDateMonth = new Date(Date.UTC(currentYear, monthIdx, 1)).getMonth() + 1;
      const isCurrentMonth = offset === 0;

      // 1st of month: Monthly Salary 75000.00
      await tx.transaction.create({
        data: {
          userId: user.id,
          categoryId: salaryCatId,
          type: TxType.INCOME,
          amount: '75000.00',
          date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, 1)),
          description: `Monthly Salary - ${targetDateYear}/${targetDateMonth}`,
          paymentMethod: PaymentMethod.BANK_TRANSFER
        }
      });

      // 1st of month: Rent expense 18000.00 (linked to recurring rule)
      await tx.transaction.create({
        data: {
          userId: user.id,
          categoryId: rentCategoryId,
          type: TxType.EXPENSE,
          amount: '18000.00',
          date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, 1)),
          description: `Apartment Rent - ${targetDateYear}/${targetDateMonth}`,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          recurringId: rentRule.id
        }
      });

      // Occasional Freelance income in past months
      if (offset === 2) {
        await tx.transaction.create({
          data: {
            userId: user.id,
            categoryId: freelanceCatId,
            type: TxType.INCOME,
            amount: '20000.00',
            date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, 15)),
            description: 'UI Design Freelance Project',
            paymentMethod: PaymentMethod.UPI
          }
        });
      } else if (offset === 1) {
        await tx.transaction.create({
          data: {
            userId: user.id,
            categoryId: freelanceCatId,
            type: TxType.INCOME,
            amount: '15000.00',
            date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, 20)),
            description: 'API Integration Consulting',
            paymentMethod: PaymentMethod.BANK_TRANSFER
          }
        });
      }

      // Generate varied expenses
      if (isCurrentMonth) {
        // In current month, Food spend must equal EXACTLY 6800.00!
        // We clamp dates to today (currentDay)
        const d1 = Math.min(2, currentDay);
        const d2 = Math.min(5, currentDay);
        const d3 = Math.min(9, currentDay);
        const d4 = Math.min(12, currentDay);

        const foodCatId = categoryMap.get('Food_EXPENSE')!;
        const foodTxAmounts = ['2000.00', '1800.00', '1500.00', '1500.00']; // Sum = 6800.00
        const foodDates = [d1, d2, d3, d4];

        for (let i = 0; i < 4; i++) {
          await tx.transaction.create({
            data: {
              userId: user.id,
              categoryId: foodCatId,
              type: TxType.EXPENSE,
              amount: foodTxAmounts[i],
              date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, foodDates[i])),
              description: `Grocery & Dining ${i + 1}`,
              paymentMethod: rng.pick(paymentMethods)
            }
          });
        }

        // Varied non-food expenses in current month up to today
        const maxDay = Math.max(1, currentDay);
        for (let i = 0; i < 10; i++) {
          const cfg = rng.pick(expenseCategories.filter((c) => c.name !== 'Food'));
          const day = rng.nextInt(1, maxDay);
          const amt = `${rng.nextInt(cfg.min, cfg.max)}.00`;
          await tx.transaction.create({
            data: {
              userId: user.id,
              categoryId: categoryMap.get(`${cfg.name}_EXPENSE`)!,
              type: TxType.EXPENSE,
              amount: amt,
              date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, day)),
              description: `${cfg.name} expense`,
              paymentMethod: rng.pick(paymentMethods)
            }
          });
        }
      } else {
        // Previous full months: 12-14 expenses per month
        const daysInMonth = new Date(targetDateYear, targetDateMonth, 0).getDate();
        for (let i = 0; i < 12; i++) {
          const cfg = rng.pick(expenseCategories);
          const day = rng.nextInt(2, daysInMonth);
          const amt = `${rng.nextInt(cfg.min, cfg.max)}.${rng.nextInt(10, 99)}`;
          await tx.transaction.create({
            data: {
              userId: user.id,
              categoryId: categoryMap.get(`${cfg.name}_EXPENSE`)!,
              type: TxType.EXPENSE,
              amount: amt,
              date: new Date(Date.UTC(targetDateYear, targetDateMonth - 1, day)),
              description: `${cfg.name} expense`,
              paymentMethod: rng.pick(paymentMethods)
            }
          });
        }
      }
    }

    // 6. Budgets for the current month
    console.log('Creating budgets and alerts...');
    const foodCatId = categoryMap.get('Food_EXPENSE')!;
    const transportCatId = categoryMap.get('Transport_EXPENSE')!;
    const entertainmentCatId = categoryMap.get('Entertainment_EXPENSE')!;
    const shoppingCatId = categoryMap.get('Shopping_EXPENSE')!;

    const foodBudget = await tx.budget.create({
      data: {
        userId: user.id,
        categoryId: foodCatId,
        type: TxType.EXPENSE,
        month: currentMonth,
        year: currentYear,
        amount: '8000.00'
      }
    });

    await tx.budget.create({
      data: {
        userId: user.id,
        categoryId: transportCatId,
        type: TxType.EXPENSE,
        month: currentMonth,
        year: currentYear,
        amount: '3000.00'
      }
    });

    await tx.budget.create({
      data: {
        userId: user.id,
        categoryId: entertainmentCatId,
        type: TxType.EXPENSE,
        month: currentMonth,
        year: currentYear,
        amount: '2500.00'
      }
    });

    await tx.budget.create({
      data: {
        userId: user.id,
        categoryId: shoppingCatId,
        type: TxType.EXPENSE,
        month: currentMonth,
        year: currentYear,
        amount: '5000.00'
      }
    });

    await tx.budget.create({
      data: {
        userId: user.id,
        categoryId: rentCategoryId,
        type: TxType.EXPENSE,
        month: currentMonth,
        year: currentYear,
        amount: '18000.00'
      }
    });

    // Alert for Food budget (80% threshold, current spend is 6800.00 / 8000.00 = 85%)
    await tx.alert.create({
      data: {
        userId: user.id,
        budgetId: foodBudget.id,
        threshold: 80,
        month: currentMonth,
        year: currentYear,
        message: 'Food budget has reached 85.0% of your ₹8,000.00 monthly limit.',
        isRead: false
      }
    });

    // Overall budget for current month
    await tx.overallBudget.create({
      data: {
        userId: user.id,
        month: currentMonth,
        year: currentYear,
        amount: '45000.00'
      }
    });

    // 7. Goals with consistent history
    console.log('Creating savings goals and contributions...');
    const goalLaptopDeadline = new Date(Date.UTC(currentYear, currentMonth + 4, 1));
    const goalLaptop = await tx.savingsGoal.create({
      data: {
        userId: user.id,
        name: 'Laptop',
        targetAmount: '60000.00',
        currentAmount: '20000.00', // 10000 + 7000 + 5000 - 2000
        deadline: goalLaptopDeadline,
        icon: 'laptop',
        color: '#3b82f6',
        status: GoalStatus.ACTIVE
      }
    });

    const laptopContribs = ['10000.00', '7000.00', '5000.00', '-2000.00'];
    for (const amt of laptopContribs) {
      await tx.goalContribution.create({
        data: {
          goalId: goalLaptop.id,
          userId: user.id,
          amount: amt,
          note: Number(amt) > 0 ? 'Monthly savings deposit' : 'Emergency repair withdrawal'
        }
      });
    }

    const goalVacation = await tx.savingsGoal.create({
      data: {
        userId: user.id,
        name: 'Vacation',
        targetAmount: '30000.00',
        currentAmount: '30000.00', // 20000 + 10000
        deadline: new Date(Date.UTC(currentYear, currentMonth - 1, 15)),
        icon: 'palmtree',
        color: '#10b981',
        status: GoalStatus.COMPLETED
      }
    });

    for (const amt of ['20000.00', '10000.00']) {
      await tx.goalContribution.create({
        data: {
          goalId: goalVacation.id,
          userId: user.id,
          amount: amt,
          note: 'Vacation fund contribution'
        }
      });
    }

    console.log('--- Seed transaction complete! ---');
  }, { timeout: 60000 });

  // 8. Print summary of row counts per table
  const userCount = await prisma.user.count();
  const categoryCount = await prisma.category.count();
  const transactionCount = await prisma.transaction.count();
  const budgetCount = await prisma.budget.count();
  const overallBudgetCount = await prisma.overallBudget.count();
  const recurringRuleCount = await prisma.recurringRule.count();
  const goalCount = await prisma.savingsGoal.count();
  const contributionCount = await prisma.goalContribution.count();
  const alertCount = await prisma.alert.count();
  const reportCount = await prisma.report.count();
  const importBatchCount = await prisma.importBatch.count();
  const refreshTokenCount = await prisma.refreshToken.count();
  const jobRunCount = await prisma.jobRun.count();

  console.log('\n================ SEED SUMMARY ================');
  console.log(`User:              ${userCount}`);
  console.log(`Category:          ${categoryCount}`);
  console.log(`Transaction:       ${transactionCount}`);
  console.log(`Budget:            ${budgetCount}`);
  console.log(`OverallBudget:     ${overallBudgetCount}`);
  console.log(`RecurringRule:     ${recurringRuleCount}`);
  console.log(`SavingsGoal:       ${goalCount}`);
  console.log(`GoalContribution:  ${contributionCount}`);
  console.log(`Alert:             ${alertCount}`);
  console.log(`Report:            ${reportCount}`);
  console.log(`ImportBatch:       ${importBatchCount}`);
  console.log(`RefreshToken:      ${refreshTokenCount}`);
  console.log(`JobRun:            ${jobRunCount}`);
  console.log('==============================================\n');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
