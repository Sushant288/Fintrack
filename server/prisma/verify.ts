// M0/Phase 1: Automated Constraint and Integrity Verification Tests
import { PrismaClient, TxType, PaymentMethod, Frequency, GoalStatus, ImportStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function expectReject(testId: number, name: string, fn: () => Promise<any>): Promise<void> {
  try {
    await fn();
    results.push({ id: testId, name, passed: false, error: 'Expected operation to throw, but it succeeded.' });
  } catch (err: any) {
    results.push({ id: testId, name, passed: true });
  }
}

async function expectPass(testId: number, name: string, fn: () => Promise<any>): Promise<void> {
  try {
    await fn();
    results.push({ id: testId, name, passed: true });
  } catch (err: any) {
    results.push({ id: testId, name, passed: false, error: err.message || String(err) });
  }
}

async function main() {
  console.log('======================================================');
  console.log('       FinTrack Phase 1: Database Verification        ');
  console.log('======================================================\n');

  const timestamp = Date.now();
  const testUserEmail1 = `verify-${timestamp}-1@fintrack.test`;
  const testUserEmail2 = `verify-${timestamp}-2@fintrack.test`;

  let u1: any = null;
  let u2: any = null;

  try {
    // Setup test users
    u1 = await prisma.user.create({
      data: {
        name: 'Verify User 1',
        email: testUserEmail1,
        passwordHash: 'dummyhash123',
        currency: 'INR'
      }
    });

    u2 = await prisma.user.create({
      data: {
        name: 'Verify User 2',
        email: testUserEmail2,
        passwordHash: 'dummyhash123',
        currency: 'USD'
      }
    });

    const catExpense1 = await prisma.category.create({
      data: { userId: u1.id, name: 'Groceries', type: TxType.EXPENSE, color: '#ff0000' }
    });

    const catIncome1 = await prisma.category.create({
      data: { userId: u1.id, name: 'Paycheck', type: TxType.INCOME, color: '#00ff00' }
    });

    // TEST 1: Transaction amount -5 is rejected; amount 0 is rejected.
    await expectReject(1, 'Transaction amount -5 is rejected; amount 0 is rejected', async () => {
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '-5.00',
          date: new Date('2026-11-01')
        }
      });
    });
    // Check amount 0
    try {
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '0.00',
          date: new Date('2026-11-01')
        }
      });
      results[0].passed = false;
      results[0].error = 'Amount 0 was unexpectedly accepted.';
    } catch {
      // Expected reject
    }

    // TEST 2: Amount 10000000000.00 (too large) is rejected (Decimal(12,2) overflow).
    await expectReject(2, 'Amount 10000000000.00 (too large) is rejected', async () => {
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '10000000000.00',
          date: new Date('2026-11-01')
        }
      });
    });

    // TEST 3: Duplicate category for same user, same type: rejected. Case variant ("groceries" vs "Groceries"): rejected.
    await expectReject(3, 'Duplicate category name and case variant rejected', async () => {
      await prisma.category.create({
        data: { userId: u1.id, name: 'groceries', type: TxType.EXPENSE, color: '#0000ff' }
      });
    });

    // TEST 4: Same category name for DIFFERENT user: accepted. Same name, other type (INCOME) for same user: accepted.
    await expectPass(4, 'Same category name for different user and different type accepted', async () => {
      await prisma.category.create({
        data: { userId: u2.id, name: 'Groceries', type: TxType.EXPENSE, color: '#ff0000' }
      });
      await prisma.category.create({
        data: { userId: u1.id, name: 'Groceries', type: TxType.INCOME, color: '#123456' }
      });
    });

    // TEST 5: Transaction using ANOTHER user's category: rejected (composite FK).
    await expectReject(5, "Transaction using another user's category rejected", async () => {
      // u1 creates transaction with u2's Groceries category
      const u2Cat = await prisma.category.findFirstOrThrow({ where: { userId: u2.id, name: 'Groceries' } });
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: u2Cat.id,
          type: TxType.EXPENSE,
          amount: '100.00',
          date: new Date('2026-11-01')
        }
      });
    });

    // TEST 6: INCOME transaction on an EXPENSE category: rejected (type mismatch).
    await expectReject(6, 'INCOME transaction on EXPENSE category rejected', async () => {
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.INCOME,
          amount: '250.00',
          date: new Date('2026-11-01')
        }
      });
    });

    // TEST 7: Budget validations
    await expectPass(7, 'Budget constraint checks (duplicate, month 13, income category, other user cat)', async () => {
      // 1. Create valid budget
      const b1 = await prisma.budget.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          month: 11,
          year: 2026,
          amount: '5000.00'
        }
      });

      // 2. Duplicate (userId, categoryId, month, year) rejected
      let dupRejected = false;
      try {
        await prisma.budget.create({
          data: {
            userId: u1.id,
            categoryId: catExpense1.id,
            type: TxType.EXPENSE,
            month: 11,
            year: 2026,
            amount: '6000.00'
          }
        });
      } catch {
        dupRejected = true;
      }
      if (!dupRejected) throw new Error('Duplicate budget was accepted');

      // 3. Month 13 rejected
      let month13Rejected = false;
      try {
        await prisma.budget.create({
          data: {
            userId: u1.id,
            categoryId: catExpense1.id,
            type: TxType.EXPENSE,
            month: 13,
            year: 2026,
            amount: '1000.00'
          }
        });
      } catch {
        month13Rejected = true;
      }
      if (!month13Rejected) throw new Error('Month 13 budget was accepted');

      // 4. Budget on INCOME category rejected
      let incomeBudgetRejected = false;
      try {
        await prisma.budget.create({
          data: {
            userId: u1.id,
            categoryId: catIncome1.id,
            type: TxType.EXPENSE,
            month: 12,
            year: 2026,
            amount: '1000.00'
          }
        });
      } catch {
        incomeBudgetRejected = true;
      }
      if (!incomeBudgetRejected) throw new Error('Budget on INCOME category was accepted');

      // 5. Budget on another user's category rejected
      const u2Cat = await prisma.category.findFirstOrThrow({ where: { userId: u2.id, name: 'Groceries' } });
      let otherUserCatRejected = false;
      try {
        await prisma.budget.create({
          data: {
            userId: u1.id,
            categoryId: u2Cat.id,
            type: TxType.EXPENSE,
            month: 12,
            year: 2026,
            amount: '1000.00'
          }
        });
      } catch {
        otherUserCatRejected = true;
      }
      if (!otherUserCatRejected) throw new Error("Budget on another user's category was accepted");
    });

    // TEST 8: Alert validations
    await expectPass(8, 'Alert checks (duplicate, threshold 0/101, cross-user budget)', async () => {
      const b = await prisma.budget.findFirstOrThrow({ where: { userId: u1.id, month: 11, year: 2026 } });

      // Create valid alert
      await prisma.alert.create({
        data: {
          userId: u1.id,
          budgetId: b.id,
          threshold: 80,
          month: 11,
          year: 2026,
          message: 'Budget 80%'
        }
      });

      // Duplicate (budgetId, threshold) rejected
      let dupRejected = false;
      try {
        await prisma.alert.create({
          data: {
            userId: u1.id,
            budgetId: b.id,
            threshold: 80,
            month: 11,
            year: 2026,
            message: 'Duplicate alert'
          }
        });
      } catch {
        dupRejected = true;
      }
      if (!dupRejected) throw new Error('Duplicate alert was accepted');

      // Threshold 0 rejected
      let t0Rejected = false;
      try {
        await prisma.alert.create({
          data: {
            userId: u1.id,
            budgetId: b.id,
            threshold: 0,
            month: 11,
            year: 2026,
            message: 'T0'
          }
        });
      } catch {
        t0Rejected = true;
      }
      if (!t0Rejected) throw new Error('Threshold 0 alert was accepted');

      // Threshold 101 rejected
      let t101Rejected = false;
      try {
        await prisma.alert.create({
          data: {
            userId: u1.id,
            budgetId: b.id,
            threshold: 101,
            month: 11,
            year: 2026,
            message: 'T101'
          }
        });
      } catch {
        t101Rejected = true;
      }
      if (!t101Rejected) throw new Error('Threshold 101 alert was accepted');

      // Cross-user budget alert rejected
      let crossUserRejected = false;
      try {
        await prisma.alert.create({
          data: {
            userId: u2.id,
            budgetId: b.id, // belongs to u1
            threshold: 90,
            month: 11,
            year: 2026,
            message: 'Cross user alert'
          }
        });
      } catch {
        crossUserRejected = true;
      }
      if (!crossUserRejected) throw new Error("Alert referencing another user's budget was accepted");
    });

    // TEST 9: Two manual transactions (recurringId NULL) on same date: accepted.
    await expectPass(9, 'Two manual transactions (recurringId NULL) on same date accepted', async () => {
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '10.00',
          date: new Date('2026-11-10'),
          recurringId: null
        }
      });
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '20.00',
          date: new Date('2026-11-10'),
          recurringId: null
        }
      });
    });

    // TEST 10: Two transactions with same (recurringId, date): second rejected.
    await expectPass(10, 'Two transactions with same (recurringId, date): second rejected', async () => {
      const rule = await prisma.recurringRule.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '100.00',
          frequency: Frequency.MONTHLY,
          startDate: new Date('2026-01-01'),
          nextRunDate: new Date('2026-02-01')
        }
      });

      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '100.00',
          date: new Date('2026-01-01'),
          recurringId: rule.id
        }
      });

      let dupRejected = false;
      try {
        await prisma.transaction.create({
          data: {
            userId: u1.id,
            categoryId: catExpense1.id,
            type: TxType.EXPENSE,
            amount: '100.00',
            date: new Date('2026-01-01'),
            recurringId: rule.id
          }
        });
      } catch {
        dupRejected = true;
      }
      if (!dupRejected) throw new Error('Duplicate (recurringId, date) transaction was accepted');
    });

    // TEST 11: RecurringRule with endDate before startDate: rejected; nextRunDate before startDate: rejected.
    await expectPass(11, 'RecurringRule date order checks (endDate / nextRunDate < startDate)', async () => {
      let endBeforeStartRejected = false;
      try {
        await prisma.recurringRule.create({
          data: {
            userId: u1.id,
            categoryId: catExpense1.id,
            type: TxType.EXPENSE,
            amount: '50.00',
            frequency: Frequency.MONTHLY,
            startDate: new Date('2026-05-01'),
            endDate: new Date('2026-04-01'),
            nextRunDate: new Date('2026-05-01')
          }
        });
      } catch {
        endBeforeStartRejected = true;
      }
      if (!endBeforeStartRejected) throw new Error('endDate < startDate rule was accepted');

      let nextBeforeStartRejected = false;
      try {
        await prisma.recurringRule.create({
          data: {
            userId: u1.id,
            categoryId: catExpense1.id,
            type: TxType.EXPENSE,
            amount: '50.00',
            frequency: Frequency.MONTHLY,
            startDate: new Date('2026-05-01'),
            nextRunDate: new Date('2026-04-01')
          }
        });
      } catch {
        nextBeforeStartRejected = true;
      }
      if (!nextBeforeStartRejected) throw new Error('nextRunDate < startDate rule was accepted');
    });

    // TEST 12: GoalContribution on another user's goal: rejected; amount 0 rejected.
    await expectPass(12, "GoalContribution checks (another user's goal, amount 0)", async () => {
      const g1 = await prisma.savingsGoal.create({
        data: {
          userId: u1.id,
          name: 'Emergency Fund',
          targetAmount: '50000.00',
          currentAmount: '0.00'
        }
      });

      // Contribution from u2 on u1's goal rejected
      let crossUserRejected = false;
      try {
        await prisma.goalContribution.create({
          data: {
            goalId: g1.id,
            userId: u2.id,
            amount: '1000.00'
          }
        });
      } catch {
        crossUserRejected = true;
      }
      if (!crossUserRejected) throw new Error("GoalContribution on another user's goal was accepted");

      // Amount 0 rejected
      let zeroAmtRejected = false;
      try {
        await prisma.goalContribution.create({
          data: {
            goalId: g1.id,
            userId: u1.id,
            amount: '0.00'
          }
        });
      } catch {
        zeroAmtRejected = true;
      }
      if (!zeroAmtRejected) throw new Error('GoalContribution amount 0 was accepted');
    });

    // TEST 13: SavingsGoal targetAmount 0 rejected; currentAmount -1 rejected.
    await expectPass(13, 'SavingsGoal constraint checks (targetAmount 0, currentAmount -1)', async () => {
      let targetZeroRejected = false;
      try {
        await prisma.savingsGoal.create({
          data: {
            userId: u1.id,
            name: 'Zero Target',
            targetAmount: '0.00'
          }
        });
      } catch {
        targetZeroRejected = true;
      }
      if (!targetZeroRejected) throw new Error('SavingsGoal targetAmount 0 was accepted');

      let currentNegativeRejected = false;
      try {
        await prisma.savingsGoal.create({
          data: {
            userId: u1.id,
            name: 'Negative Current',
            targetAmount: '100.00',
            currentAmount: '-1.00'
          }
        });
      } catch {
        currentNegativeRejected = true;
      }
      if (!currentNegativeRejected) throw new Error('SavingsGoal currentAmount -1 was accepted');
    });

    // TEST 14: User email with uppercase letters rejected; currency "inr" rejected.
    await expectPass(14, 'User constraints (email lowercase, currency uppercase 3-letters)', async () => {
      let upperEmailRejected = false;
      try {
        await prisma.user.create({
          data: {
            name: 'Upper Email',
            email: `UPPER-${timestamp}@fintrack.test`,
            passwordHash: 'hash',
            currency: 'INR'
          }
        });
      } catch {
        upperEmailRejected = true;
      }
      if (!upperEmailRejected) throw new Error('Uppercase user email was accepted');

      let lowerCurrencyRejected = false;
      try {
        await prisma.user.create({
          data: {
            name: 'Lower Curr',
            email: `lowercurr-${timestamp}@fintrack.test`,
            passwordHash: 'hash',
            currency: 'inr'
          }
        });
      } catch {
        lowerCurrencyRejected = true;
      }
      if (!lowerCurrencyRejected) throw new Error('Lowercase currency was accepted');
    });

    // TEST 15: Deleting Category with transactions: rejected. Deleting empty category: accepted.
    await expectPass(15, 'Deleting category with transactions rejected; empty category accepted', async () => {
      const catWithTx = await prisma.category.create({
        data: { userId: u1.id, name: 'WithTx', type: TxType.EXPENSE, color: '#333333' }
      });
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catWithTx.id,
          type: TxType.EXPENSE,
          amount: '50.00',
          date: new Date('2026-11-01')
        }
      });

      let deleteRejected = false;
      try {
        await prisma.category.delete({ where: { id: catWithTx.id } });
      } catch {
        deleteRejected = true;
      }
      if (!deleteRejected) throw new Error('Category with transactions was deleted');

      // Empty category deletion
      const emptyCat = await prisma.category.create({
        data: { userId: u1.id, name: 'EmptyCat', type: TxType.EXPENSE, color: '#444444' }
      });
      await prisma.category.delete({ where: { id: emptyCat.id } });
    });

    // TEST 16: Deleting User with FULL data graph succeeds and leaves ZERO rows for that user in every table.
    await expectPass(16, 'Full data graph user deletion cascade test (leaves zero rows)', async () => {
      const uFull = await prisma.user.create({
        data: {
          name: 'Cascade Full User',
          email: `cascade-${timestamp}@fintrack.test`,
          passwordHash: 'hash',
          currency: 'INR'
        }
      });

      const cat = await prisma.category.create({
        data: { userId: uFull.id, name: 'CascadeCat', type: TxType.EXPENSE, color: '#111111' }
      });

      const txRecord = await prisma.transaction.create({
        data: {
          userId: uFull.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: '100.00',
          date: new Date('2026-11-01')
        }
      });

      const b = await prisma.budget.create({
        data: {
          userId: uFull.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          month: 11,
          year: 2026,
          amount: '1000.00'
        }
      });

      await prisma.alert.create({
        data: {
          userId: uFull.id,
          budgetId: b.id,
          threshold: 80,
          month: 11,
          year: 2026,
          message: 'Alert msg'
        }
      });

      await prisma.overallBudget.create({
        data: { userId: uFull.id, month: 11, year: 2026, amount: '5000.00' }
      });

      await prisma.recurringRule.create({
        data: {
          userId: uFull.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: '200.00',
          frequency: Frequency.MONTHLY,
          startDate: new Date('2026-01-01'),
          nextRunDate: new Date('2026-02-01')
        }
      });

      const g = await prisma.savingsGoal.create({
        data: { userId: uFull.id, name: 'CascadeGoal', targetAmount: '10000.00', currentAmount: '500.00' }
      });

      await prisma.goalContribution.create({
        data: { goalId: g.id, userId: uFull.id, amount: '500.00' }
      });

      await prisma.report.create({
        data: { userId: uFull.id, month: 11, year: 2026, dataJson: { test: true } }
      });

      await prisma.importBatch.create({
        data: { userId: uFull.id, fileName: 'data.csv', rowsTotal: 10, rowsImported: 10, status: ImportStatus.COMPLETED }
      });

      await prisma.refreshToken.create({
        data: { userId: uFull.id, tokenHash: `hash-${timestamp}`, expiresAt: new Date(Date.now() + 86400000) }
      });

      // Now DELETE the user
      await prisma.user.delete({ where: { id: uFull.id } });

      // Verify ZERO rows in all tables for uFull.id
      const remainingTx = await prisma.transaction.count({ where: { userId: uFull.id } });
      const remainingCat = await prisma.category.count({ where: { userId: uFull.id } });
      const remainingB = await prisma.budget.count({ where: { userId: uFull.id } });
      const remainingA = await prisma.alert.count({ where: { userId: uFull.id } });
      const remainingOB = await prisma.overallBudget.count({ where: { userId: uFull.id } });
      const remainingRR = await prisma.recurringRule.count({ where: { userId: uFull.id } });
      const remainingG = await prisma.savingsGoal.count({ where: { userId: uFull.id } });
      const remainingGC = await prisma.goalContribution.count({ where: { userId: uFull.id } });
      const remainingR = await prisma.report.count({ where: { userId: uFull.id } });
      const remainingIB = await prisma.importBatch.count({ where: { userId: uFull.id } });
      const remainingRT = await prisma.refreshToken.count({ where: { userId: uFull.id } });

      const sum = remainingTx + remainingCat + remainingB + remainingA + remainingOB +
                  remainingRR + remainingG + remainingGC + remainingR + remainingIB + remainingRT;

      if (sum !== 0) throw new Error(`Cascade deletion left ${sum} orphaned records across tables!`);
    });

    // TEST 17: Deleting a RecurringRule keeps its generated transactions and sets recurringId to NULL.
    await expectPass(17, 'Deleting RecurringRule sets transaction recurringId to NULL', async () => {
      const rule = await prisma.recurringRule.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '75.00',
          frequency: Frequency.WEEKLY,
          startDate: new Date('2026-06-01'),
          nextRunDate: new Date('2026-06-08')
        }
      });

      const tx = await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '75.00',
          date: new Date('2026-06-01'),
          recurringId: rule.id
        }
      });

      await prisma.recurringRule.delete({ where: { id: rule.id } });

      const updatedTx = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      if (updatedTx.recurringId !== null) {
        throw new Error(`Expected recurringId to be NULL after rule deletion, got ${updatedTx.recurringId}`);
      }
    });

    // TEST 18: Rollback: a prisma.$transaction that inserts a transaction and then throws leaves no row behind.
    await expectPass(18, 'prisma.$transaction rollback leaves no row behind', async () => {
      const rollbackTag = `rollback-${timestamp}`;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              userId: u1.id,
              categoryId: catExpense1.id,
              type: TxType.EXPENSE,
              amount: '999.00',
              date: new Date('2026-11-01'),
              description: rollbackTag
            }
          });
          throw new Error('Forced rollback test');
        });
      } catch {
        // Expected throw
      }

      const found = await prisma.transaction.findFirst({ where: { description: rollbackTag } });
      if (found) throw new Error('Transaction was committed despite error thrown inside transaction');
    });

    // TEST 19: Money precision: insert 0.10 and 0.20 as strings, SUM in SQL returns exactly 0.30.
    await expectPass(19, 'Money precision check (SUM 0.10 + 0.20 returns exactly 0.30)', async () => {
      const descTag = `precision-${timestamp}`;
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '0.10',
          date: new Date('2026-11-02'),
          description: descTag
        }
      });
      await prisma.transaction.create({
        data: {
          userId: u1.id,
          categoryId: catExpense1.id,
          type: TxType.EXPENSE,
          amount: '0.20',
          date: new Date('2026-11-03'),
          description: descTag
        }
      });

      const queryRes: any[] = await prisma.$queryRaw`
        SELECT SUM(amount)::text as total FROM "Transaction" WHERE description = ${descTag}
      `;
      const sumString = queryRes[0]?.total;
      if (sumString !== '0.30') {
        throw new Error(`Expected '0.30', received '${sumString}'`);
      }
    });

    // TEST 20: Seeded demo data consistency (after db:seed).
    await expectPass(20, 'Seeded demo data consistency (goals sum, no future dates, Food spend = 6800.00)', async () => {
      const demoUser = await prisma.user.findUnique({ where: { email: 'demo@fintrack.dev' } });
      if (!demoUser) {
        throw new Error('demo@fintrack.dev not found. Run db:seed before verify.');
      }

      // Check goals
      const goals = await prisma.savingsGoal.findMany({
        where: { userId: demoUser.id },
        include: { contributions: true }
      });
      for (const g of goals) {
        const sumContribs = g.contributions.reduce((acc, c) => acc + Number(c.amount), 0);
        if (Math.abs(Number(g.currentAmount) - sumContribs) > 0.001) {
          throw new Error(`Goal ${g.name} currentAmount (${g.currentAmount}) != SUM(contributions) (${sumContribs})`);
        }
      }

      // No future-dated transactions
      const now = new Date();
      const futureTxCount = await prisma.transaction.count({
        where: {
          userId: demoUser.id,
          date: { gt: now }
        }
      });
      if (futureTxCount > 0) {
        throw new Error(`Found ${futureTxCount} transactions dated in the future!`);
      }

      // Food spend in current month equals 6800.00
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const startOfMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
      const endOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));

      const foodCat = await prisma.category.findFirstOrThrow({
        where: { userId: demoUser.id, name: 'Food', type: TxType.EXPENSE }
      });

      const foodSpendRes: any[] = await prisma.$queryRaw`
        SELECT COALESCE(SUM(amount), 0)::text as total
        FROM "Transaction"
        WHERE "userId" = ${demoUser.id}
          AND "categoryId" = ${foodCat.id}
          AND "date" >= ${startOfMonth}
          AND "date" < ${endOfMonth}
      `;
      const foodTotal = foodSpendRes[0]?.total;
      if (foodTotal !== '6800.00') {
        throw new Error(`Current month Food spend was expected to be 6800.00, but got ${foodTotal}`);
      }
    });

    // TEST 21: Catalog check: verify required indexes and check constraints in postgres system catalogs.
    await expectPass(21, 'Catalog check (functional index, compound indexes, CHECK constraints)', async () => {
      const requiredIndexes = [
        'Category_userId_lowername_type_key',
        'Transaction_userId_date_idx',
        'Transaction_userId_categoryId_date_idx',
        'RecurringRule_isActive_nextRunDate_idx',
        'Alert_userId_isRead_createdAt_idx'
      ];

      const foundIndexes: any[] = await prisma.$queryRaw`
        SELECT indexname FROM pg_indexes WHERE indexname = ANY(${requiredIndexes})
      `;
      const foundIdxNames = foundIndexes.map((i) => i.indexname);
      for (const idx of requiredIndexes) {
        if (!foundIdxNames.includes(idx)) {
          throw new Error(`Missing expected index in pg_indexes: ${idx}`);
        }
      }

      const requiredChecks = [
        'User_email_lowercase_chk',
        'User_currency_chk',
        'User_name_chk',
        'User_alertThresholds_chk',
        'Category_name_chk',
        'Category_color_chk',
        'Category_noSelfParent_chk',
        'Transaction_amount_chk',
        'Budget_amount_chk',
        'Budget_month_chk',
        'Budget_year_chk',
        'Budget_expenseOnly_chk',
        'OverallBudget_amount_chk',
        'OverallBudget_month_chk',
        'OverallBudget_year_chk',
        'RecurringRule_amount_chk',
        'RecurringRule_endDate_chk',
        'RecurringRule_nextRun_chk',
        'SavingsGoal_name_chk',
        'SavingsGoal_target_chk',
        'SavingsGoal_current_chk',
        'GoalContribution_amount_chk',
        'Alert_threshold_chk',
        'Alert_month_chk',
        'Report_month_chk',
        'ImportBatch_rows_chk',
        'JobRun_finished_chk'
      ];

      const foundChecks: any[] = await prisma.$queryRaw`
        SELECT conname FROM pg_constraint WHERE conname = ANY(${requiredChecks})
      `;
      const foundChkNames = foundChecks.map((c) => c.conname);
      for (const chk of requiredChecks) {
        if (!foundChkNames.includes(chk)) {
          throw new Error(`Missing expected CHECK constraint in pg_constraint: ${chk}`);
        }
      }
    });

  } finally {
    // Cleanup temporary test users
    console.log('\nCleaning up temporary test users...');
    if (u1) await prisma.user.delete({ where: { id: u1.id } }).catch(() => {});
    if (u2) await prisma.user.delete({ where: { id: u2.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  // Print PASS / FAIL Table
  console.log('\n======================================================');
  console.log('                 VERIFICATION RESULTS                 ');
  console.log('======================================================');
  let hasFailed = false;

  for (const r of results) {
    const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`[${status}] Test ${r.id.toString().padStart(2, ' ')}: ${r.name}`);
    if (!r.passed && r.error) {
      console.log(`       Error: ${r.error}`);
      hasFailed = true;
    }
  }

  console.log('======================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  console.log('======================================================\n');

  if (hasFailed || results.length !== 21) {
    console.error('Verification failed! Exit with code 1.');
    process.exit(1);
  } else {
    console.log('All 21 verification tests passed successfully! Exit with code 0.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
