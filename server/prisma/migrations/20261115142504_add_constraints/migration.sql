-- User
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_chk" CHECK (email = lower(email));
ALTER TABLE "User" ADD CONSTRAINT "User_currency_chk" CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE "User" ADD CONSTRAINT "User_name_chk" CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);
ALTER TABLE "User" ADD CONSTRAINT "User_alertThresholds_chk"
  CHECK (cardinality("alertThresholds") BETWEEN 1 AND 5
         AND 1 <= ALL("alertThresholds") AND 100 >= ALL("alertThresholds"));

-- Category
ALTER TABLE "Category" ADD CONSTRAINT "Category_name_chk" CHECK (char_length(btrim(name)) BETWEEN 1 AND 40);
ALTER TABLE "Category" ADD CONSTRAINT "Category_color_chk" CHECK (color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE "Category" ADD CONSTRAINT "Category_noSelfParent_chk" CHECK ("parentId" IS NULL OR "parentId" <> id);
CREATE UNIQUE INDEX "Category_userId_lowername_type_key" ON "Category" ("userId", lower(name), type);

-- Transaction
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_chk" CHECK (amount > 0);

-- Budget and OverallBudget
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_amount_chk" CHECK (amount > 0);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_month_chk" CHECK (month BETWEEN 1 AND 12);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_year_chk" CHECK (year BETWEEN 2000 AND 2100);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_expenseOnly_chk" CHECK (type = 'EXPENSE');
ALTER TABLE "OverallBudget" ADD CONSTRAINT "OverallBudget_amount_chk" CHECK (amount > 0);
ALTER TABLE "OverallBudget" ADD CONSTRAINT "OverallBudget_month_chk" CHECK (month BETWEEN 1 AND 12);
ALTER TABLE "OverallBudget" ADD CONSTRAINT "OverallBudget_year_chk" CHECK (year BETWEEN 2000 AND 2100);

-- RecurringRule
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_amount_chk" CHECK (amount > 0);
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_endDate_chk" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_nextRun_chk" CHECK ("nextRunDate" >= "startDate");

-- SavingsGoal and GoalContribution
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_name_chk" CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_target_chk" CHECK ("targetAmount" > 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_current_chk" CHECK ("currentAmount" >= 0);
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_amount_chk" CHECK (amount <> 0);

-- Alert and Report
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_threshold_chk" CHECK (threshold BETWEEN 1 AND 100);
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_month_chk" CHECK (month BETWEEN 1 AND 12);
ALTER TABLE "Report" ADD CONSTRAINT "Report_month_chk" CHECK (month BETWEEN 1 AND 12);

-- ImportBatch and JobRun
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_rows_chk" CHECK ("rowsTotal" >= 0 AND "rowsImported" BETWEEN 0 AND "rowsTotal");
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_finished_chk" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");
