# Smart Family Budget Planning System

A full-stack family finance platform: track income and expenses, plan monthly and category budgets, set savings goals, manage recurring and pending payments, and get alerts and insights calculated from your real data.

> **Demo login (sample data only):** `demo@smartbudget.com` / `Demo@12345`
> Created by the seed script. Two more demo members exist: `priya.demo@smartbudget.com` and `arjun.demo@smartbudget.com` (same password, role MEMBER).

## Features

- **Auth**: register, login, logout, JWT, bcrypt hashing, protected routes, persistent login, profile, change password
- **Roles**: `ADMIN` and `MEMBER`, enforced on the backend (see the permission table below)
- **Family**: create/edit family, add/remove members, change roles, family-level financial summary
- **Income and expenses**: full CRUD, search, filters, sorting, pagination, date range, category/member/payment method
- **Budgets**: monthly total plus category budgets with live spent / remaining / percent / status (Safe, Warning, Critical, Exceeded)
- **Savings goals**: contributions, progress, remaining amount, required monthly saving, "behind schedule" detection
- **Recurring expenses**: weekly/monthly/quarterly/yearly, correct next-due-date maths (month-end safe), optional auto-created expenses, reminders
- **Pending payments**: pending/paid/overdue detection, due today/upcoming/overdue buckets, mark paid (optionally records an expense)
- **Dashboard**: 8 summary cards, 5 charts, recent transactions, upcoming payments, alerts, smart insights, all from the database
- **Smart insights and alerts**: generated dynamically (no hardcoded sentences); notifications with INFO / WARNING / CRITICAL severity, mark read / mark all read
- **Analytics**: monthly income/expenses/savings, category distribution, budget vs actual, savings progress, recurring burden, cash flow, with range filters (this month, last month, 3 months, 6 months, this year, custom)
- **Reports**: monthly financial, expense, income, budget and savings reports with charts, tables, **CSV** and **PDF** export
- **Transactions**: unified income + expense history with search, filters, sorting, pagination
- **UI**: fintech-style SaaS design, sidebar + top bar, dark mode, responsive (desktop to mobile), toasts, confirmation dialogs, empty/loading/error states, skeleton loaders

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Axios, Lucide React, jsPDF |
| Backend | Node.js, Express, TypeScript, Zod, JWT (`jsonwebtoken`), `bcrypt`, Helmet, CORS, rate limiting, dotenv |
| Database | PostgreSQL 16 + Prisma ORM |
| Tooling | Docker Compose (database), Vitest + Supertest, ESLint, concurrently |

## Architecture

```
React SPA (Vite, :5173)  --Axios + JWT-->  Express REST API (:5000)  --Prisma-->  PostgreSQL (:5432)
```

- Routes -> validators (Zod) -> controllers -> services/utilities -> Prisma.
- **All money maths is in pure functions** (`backend/src/utils/finance.ts`, `insights.ts`) so it is unit-tested without a database.
- Every query is scoped by `familyId`; users can never read another family's data.
- Prisma `Decimal` values are converted to numbers in every JSON response.
- Dates are stored as UTC midnight; "today" uses `TZ_OFFSET_MINUTES` (default 330 = India).

## Folder structure

```
smart-family-budget-planning-system/
├── backend/
│   ├── prisma/            schema.prisma, seed.ts
│   ├── src/
│   │   ├── config/        env (Zod-validated), prisma client
│   │   ├── controllers/   one file per resource
│   │   ├── middleware/    auth, validation, error handling
│   │   ├── routes/        route table
│   │   ├── services/      stats, notifications, recurring processing
│   │   ├── validators/    Zod schemas
│   │   ├── utils/         finance.ts, insights.ts, jwt, clock, ...
│   │   ├── app.ts         Express app factory
│   │   └── server.ts      entry point
│   ├── tests/             Vitest suites + in-memory Prisma fake
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/    ui kit, charts, layout, shared record manager
│   │   ├── context/       auth, settings (theme), toasts
│   │   ├── hooks/ lib/    data fetching, API client, formatting, CSV/PDF export
│   │   └── pages/         one file per route
│   └── .env.example
├── shared/                constants shared with the UI (categories, labels, colours)
├── tests/                 pointer to the test suites
├── docker-compose.yml     PostgreSQL
├── package.json           root scripts
└── .env.example
```

## Requirements

- **Node.js 20 or newer** (22 recommended): https://nodejs.org
- **Docker Desktop** (for PostgreSQL): https://www.docker.com/products/docker-desktop. Or an existing PostgreSQL 14+ server.
- **VS Code** (recommended) with the ESLint and Prisma extensions

## Windows + VS Code setup (step by step)

1. **Extract** `smart-family-budget-planning-system.zip` and open the folder in VS Code (`File > Open Folder`).
2. Open the integrated terminal (`Ctrl + ` `` ` ``). PowerShell or Command Prompt both work.
3. **Start PostgreSQL** (Docker Desktop must be running):
   ```powershell
   npm run db:up
   ```
   This starts a container named `smart_family_budget_db` with database `smart_family_budget`, user `budget_user`, password `budget_password`, port `5432`, and a persistent volume.
4. **Create the environment files**:
   ```powershell
   copy backend\.env.example backend\.env
   copy frontend\.env.example frontend\.env
   ```
   Edit `backend/.env` and set `JWT_SECRET` to a long random string. The default `DATABASE_URL` already matches the Docker database.
5. **Install all dependencies**:
   ```powershell
   npm run install:all
   ```
   (This also runs `prisma generate` automatically.)
6. **Create the tables and load demo data**:
   ```powershell
   npm run db:setup
   ```
   This generates the Prisma client, runs `prisma migrate dev --name init` (creating `backend/prisma/migrations`) and seeds the demo family.
7. **Run everything**:
   ```powershell
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - API: http://localhost:5000/api (health check: http://localhost:5000/api/health)
8. Sign in with the demo account above (the login page has a "Fill demo credentials" button).

### Running pieces separately

```powershell
npm run dev --prefix backend     # API only
npm run dev --prefix frontend    # UI only
```

## Environment variables

**backend/.env**

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | matches docker-compose |
| `JWT_SECRET` | Secret for signing tokens (16+ chars, use 32+) | none, required |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `PORT` | API port | `5000` |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated | `http://localhost:5173` |
| `BCRYPT_ROUNDS` | bcrypt cost | `10` |
| `TZ_OFFSET_MINUTES` | Offset from UTC that defines "today" | `330` |

**frontend/.env**: `VITE_API_URL=http://localhost:5000/api`

No real secrets are committed; `.env` files are git-ignored.

## Database

```powershell
npm run prisma:generate --prefix backend   # generate the Prisma client
npm run prisma:migrate --prefix backend    # create/apply migrations (dev)
npm run prisma:deploy --prefix backend     # apply migrations (production)
npm run seed --prefix backend              # (re)load demo data - safe to repeat
npm run prisma:studio --prefix backend     # browse data in the browser
```

Models: `User`, `Family`, `FamilyMember`, `Income`, `Expense`, `Budget`, `BudgetCategory`, `SavingsGoal`, `SavingsContribution`, `RecurringExpense`, `Payment`, `Notification`.
Enums: `UserRole`, `IncomeCategory`, `ExpenseCategory`, `PaymentStatus`, `NotificationSeverity`, `TransactionType`, `RecurrenceFrequency` (plus `PaymentMethod` and `SavingsCategory`).

## Roles and permissions

| Action | ADMIN | MEMBER |
|--------|:----:|:------:|
| View family data, dashboard, analytics, reports, transactions | yes | yes |
| Add income / expenses | yes (for any member) | yes (own only) |
| Edit / delete income and expenses | any record | own records only |
| Create/edit/delete budgets | yes | no |
| Manage savings goals and contributions | yes | no |
| Manage recurring expenses and pending payments | yes | no |
| Edit family, add/remove members, change roles | yes | no |
| Profile, password, notifications | yes | yes |

Rules are enforced in the API (`requireRole`, `assertCanModify`), not just hidden in the UI. A family always keeps at least one admin.

## API overview (all under `/api`, JWT `Authorization: Bearer <token>`)

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/change-password` |
| Family | `GET/POST/PUT /family`, `GET/POST /family/members`, `PUT/DELETE /family/members/:id` |
| Income | `GET/POST /income`, `GET/PUT/DELETE /income/:id` |
| Expenses | `GET/POST /expenses`, `GET/PUT/DELETE /expenses/:id` |
| Transactions | `GET /transactions` (unified) |
| Budgets | `GET/POST /budgets`, `PUT/DELETE /budgets/:id` |
| Savings | `GET/POST /savings-goals`, `GET/PUT/DELETE /savings-goals/:id`, `POST /savings-goals/:id/contribute` |
| Recurring | `GET/POST /recurring`, `PUT/DELETE /recurring/:id`, `POST /recurring/process` |
| Payments | `GET/POST /payments`, `GET/PUT/DELETE /payments/:id`, `POST /payments/:id/mark-paid` |
| Analytics | `GET /analytics/dashboard`, `/analytics/monthly`, `/analytics/categories`, `/analytics/cashflow` |
| Notifications | `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all` |
| Reports | `GET /reports/monthly`, `/reports/expenses`, `/reports/income`, `/reports/budget`, `/reports/savings` |
| Health | `GET /health` |

List endpoints accept `page`, `limit`, `search`, `sortBy`, `sortOrder` and relevant filters. Errors use a consistent shape: `{ "message": "...", "errors": [{ "path": "...", "message": "..." }] }`.

## Financial calculations

- Total income = SUM(income); total expenses = SUM(expenses)
- Balance = Savings = income - expenses
- Savings rate = savings / income x 100
- Budget usage = spent / budget x 100 -> `<70` Safe, `70-90` Warning, `90-100` Critical, `>=100` Exceeded
- Expense-to-income ratio = expenses / income x 100
- Every division is zero-safe (`safeDivide`).

## Testing

```powershell
npm run test            # all backend tests (no database needed)
npm run lint
npm run typecheck
```

See `tests/README.md` for what each suite covers.

## Build

```powershell
npm run build           # backend (tsc -> backend/dist) and frontend (vite build -> frontend/dist)
cd backend && npm start # run the compiled API (set NODE_ENV=production and your own JWT_SECRET)
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Invalid environment configuration` on backend start | `backend/.env` is missing or `JWT_SECRET` is shorter than 16 characters. |
| `Can't reach database server at localhost:5432` | Start Docker Desktop, then `npm run db:up`. If another PostgreSQL uses port 5432, stop it or change the port in `docker-compose.yml` and `DATABASE_URL`. |
| `prisma migrate dev` asks to reset | Safe in development. Accept, then `npm run seed --prefix backend`. |
| Prisma errors about missing client | Run `npm run prisma:generate --prefix backend`. |
| `bcrypt` fails to install | Use Node 20/22 LTS. On very new Node versions install the Visual Studio Build Tools "Desktop development with C++" workload, then reinstall. |
| Login works but pages show "Cannot reach the server" | Backend not running, or `VITE_API_URL` / `CLIENT_URL` ports do not match. Restart both after editing `.env`. |
| Redirected to `/family` after sign-up | Expected: create your family first. Other pages need a family. |
| Port 5173 or 5000 already in use | Change `PORT` (backend) and `server.port` in `frontend/vite.config.ts`, then update `CLIENT_URL` / `VITE_API_URL`. |
| PowerShell blocks `npm` scripts | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt. |

## Notes

- Auto-created recurring expenses are processed when pages load and hourly while the API runs (no cron needed).
- Alerts are evaluated whenever the dashboard or notifications load, and de-duplicated per user.
- PDF exports use the built-in PDF fonts, so amounts appear as `Rs.` rather than the rupee sign.
- Seeded sample records are demo data; edit or delete them freely.
