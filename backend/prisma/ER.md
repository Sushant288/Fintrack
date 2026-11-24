# FinTrack Database Entity Relationship & Constraints Reference

## 1. Mermaid Entity-Relationship Diagram (13 Tables)

```mermaid
erDiagram
    User ||--o{ Category : "owns"
    User ||--o{ Transaction : "records"
    User ||--o{ Budget : "sets"
    User ||--o{ OverallBudget : "defines"
    User ||--o{ RecurringRule : "schedules"
    User ||--o{ SavingsGoal : "targets"
    User ||--o{ GoalContribution : "contributes"
    User ||--o{ Alert : "receives"
    User ||--o{ Report : "generates"
    User ||--o{ ImportBatch : "imports"
    User ||--o{ RefreshToken : "authenticates"

    Category ||--o{ Category : "parent of (CategoryTree)"
    Category ||--o{ Transaction : "classifies (composite FK)"
    Category ||--o{ Budget : "allocated for (composite FK)"
    Category ||--o{ RecurringRule : "categorizes (composite FK)"

    RecurringRule ||--o{ Transaction : "generates"
    ImportBatch ||--o{ Transaction : "contains"
    Transaction |o--o| GoalContribution : "linked to (optional 1:1)"
    SavingsGoal ||--o{ GoalContribution : "accumulates (composite FK)"
    Budget ||--o{ Alert : "triggers (composite FK)"

    User {
        string id PK
        string name
        string email UK
        string passwordHash
        string currency
        string timezone
        int_array alertThresholds
        boolean alertInAppEnabled
        boolean alertEmailEnabled
        datetime createdAt
        datetime updatedAt
    }

    Category {
        string id PK
        string userId FK, UK
        string name UK
        TxType type UK
        string color
        string icon
        boolean isArchived
        boolean isDefault
        string parentId FK
        datetime createdAt
        datetime updatedAt
    }

    Transaction {
        string id PK
        string userId FK
        string categoryId FK
        TxType type FK
        decimal amount
        date date UK
        string description
        PaymentMethod paymentMethod
        string recurringId FK, UK
        string importBatchId FK
        datetime createdAt
        datetime updatedAt
    }

    Budget {
        string id PK, UK
        string userId FK, UK
        string categoryId FK, UK
        TxType type FK
        int month UK
        int year UK
        decimal amount
        datetime createdAt
        datetime updatedAt
    }

    OverallBudget {
        string id PK
        string userId FK, UK
        int month UK
        int year UK
        decimal amount
        datetime createdAt
        datetime updatedAt
    }

    RecurringRule {
        string id PK
        string userId FK
        string categoryId FK
        TxType type FK
        decimal amount
        string description
        PaymentMethod paymentMethod
        Frequency frequency
        date startDate
        date endDate
        date nextRunDate
        boolean isActive
        datetime lastRunAt
        datetime createdAt
        datetime updatedAt
    }

    SavingsGoal {
        string id PK, UK
        string userId FK, UK
        string name
        decimal targetAmount
        decimal currentAmount
        date deadline
        string icon
        string color
        GoalStatus status
        datetime createdAt
        datetime updatedAt
    }

    GoalContribution {
        string id PK
        string goalId FK
        string userId FK
        decimal amount
        string note
        string transactionId FK, UK
        datetime createdAt
    }

    Alert {
        string id PK
        string userId FK
        string budgetId FK, UK
        int threshold UK
        int month
        int year
        string message
        boolean isRead
        datetime createdAt
    }

    Report {
        string id PK
        string userId FK, UK
        int month UK
        int year UK
        json dataJson
        string pdfPath
        datetime generatedAt
    }

    ImportBatch {
        string id PK
        string userId FK
        string fileName
        int rowsTotal
        int rowsImported
        ImportStatus status
        datetime createdAt
    }

    RefreshToken {
        string id PK
        string userId FK
        string tokenHash UK
        datetime expiresAt
        datetime revokedAt
        datetime createdAt
    }

    JobRun {
        string id PK
        string jobName
        JobStatus status
        datetime startedAt
        datetime finishedAt
        int processed
        int failed
        string errorMessage
    }
```

---

## 2. Unique Constraints & Business Rules Table

| Table | Constraint / Index | Business Rule Enforced |
|---|---|---|
| `User` | `User_email_key` (`email`) | Prevents duplicate user accounts; each email is globally unique. |
| `Category` | `Category_userId_name_type_key` (`userId`, `name`, `type`) | Prevents duplicate category names for the same user and transaction type. |
| `Category` | `Category_id_userId_type_key` (`id`, `userId`, `type`) | Enables composite foreign keys to ensure cross-tenant and type isolation at the database level. |
| `Category` | `Category_userId_lowername_type_key` (`userId`, `lower(name)`, `type`) | Functional unique index enforcing case-insensitive category name uniqueness per user and type (e.g. "Food" vs "food"). |
| `Transaction` | `Transaction_recurringId_date_key` (`recurringId`, `date`) | Enforces idempotent recurring transaction generation (no duplicates per date), while permitting unlimited manual transactions (NULL recurringId). |
| `Budget` | `Budget_userId_categoryId_month_year_key` (`userId`, `categoryId`, `month`, `year`) | Ensures at most one category budget per category per calendar month for a user. |
| `Budget` | `Budget_id_userId_key` (`id`, `userId`) | Enables composite foreign key from Alert to Budget ensuring alerts can never reference another user's budget. |
| `OverallBudget` | `OverallBudget_userId_month_year_key` (`userId`, `month`, `year`) | Ensures at most one overall monthly spending budget per user for any given month/year. |
| `SavingsGoal` | `SavingsGoal_id_userId_key` (`id`, `userId`) | Enables composite foreign key from GoalContribution to SavingsGoal ensuring contributions cannot link to another user's goal. |
| `GoalContribution` | `GoalContribution_transactionId_key` (`transactionId`) | Enforces optional 1:1 relationship between an expense/income transaction and a goal contribution. |
| `Alert` | `Alert_budgetId_threshold_key` (`budgetId`, `threshold`) | Guarantees an alert for a specific threshold percentage (e.g. 80% or 100%) is generated at most once per monthly category budget. |
| `Report` | `Report_userId_month_year_key` (`userId`, `month`, `year`) | Ensures at most one generated monthly report record per user for a given month and year. |
| `RefreshToken` | `RefreshToken_tokenHash_key` (`tokenHash`) | Guarantees cryptographic refresh token uniqueness, preventing token replay attacks. |
