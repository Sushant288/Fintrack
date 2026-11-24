# Fintrack - Personal Finance Tracking Application

A full-stack personal finance tracker designed for budgeting, expense tracking, recurring transactions, financial goal setting, and analytics.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Zod
- **Frontend**: React, TypeScript, Vite, React Query (TanStack Query), Tailwind CSS

## Project Structure

```
fintrack/
├── .github/workflows/ci.yml           # CI lint + test pipeline
├── backend/                           # Express + Prisma Backend
│   ├── prisma/                        # Database schema, migrations, and seeds
│   ├── src/                           # Application source code
│   └── tests/                         # Unit, integration, and job tests
└── frontend/                          # React + Vite Frontend
    └── src/                           # UI components, pages, hooks, state
```
