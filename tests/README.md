# Tests

The automated tests live next to the code they exercise, in **`backend/tests/`**, and run with Vitest:

```bash
npm run test            # from the project root
# or
cd backend && npm test
```

| File | Covers |
|------|--------|
| `auth.test.ts` | Register, login, `/auth/me`, change password, logout |
| `jwt-middleware.test.ts` | JWT signing/verification, `authenticate`, `requireRole`, `requireFamily` |
| `income.test.ts` | Income CRUD, validation, search/filter/sort/pagination, role rules, family isolation |
| `expense.test.ts` | Expense CRUD, validation, filters, role rules, admin-only endpoints |
| `calculations.test.ts` | Budget status/usage, savings metrics, goal progress, payment status, recurring due dates, date ranges |
| `analytics.test.ts` | Monthly series aggregation, category grouping, dynamic insights |

The API tests use an in-memory stand-in for Prisma (`backend/tests/helpers/fakePrisma.ts`), so **no database is needed to run the tests**.
