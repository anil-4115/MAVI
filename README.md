# MAVI

Split group expenses and track who owes whom. MAVI is a MERN (MongoDB, Express, React, Node.js) application written in TypeScript as a modular monolith: a React single-page app backed by a REST API, with all money handled in integer minor units (₹, default currency INR).

## Features

- **Authentication** — register and login with JWT + bcrypt (`Authorization: Bearer <token>`).
- **Groups** — create groups, invite members, accept/decline invitations, roles (owner / admin / member), promote/demote, ownership transfer, remove/leave, rename, and archive (groups archive instead of being deleted so history is preserved).
- **Expenses** — create, edit, and soft-void group expenses with six splitting methods:
  - **Equal** — split the amount equally among participants (largest-remainder rounding).
  - **Quantity** — split in proportion to a quantity per participant.
  - **Exact amount** — split by fixed rupee amounts that must sum to the total.
  - **Percentage** — split by percentages that must sum to 100%.
  - **Shares** — split in proportion to integer shares.
  - **Item-wise** — split multiple line items, each allocated to participants.
- **Balances** — derived (never stored) net / pairwise balances, outstanding totals, and settlement suggestions.
- **Settlements** — record a payer → receiver settlement with a note, plus cancellation (creator or owner), with notifications and balance re-derivation on every change.
- **Notifications** — in-app notifications for invitations, accepted/declined invites, role changes, expenses, settlements, removals, leaves, ownership transfers, and archives; unread counts, read/unread filters, mark-one/mark-all read, pagination, and an activity view.
- **Personal expenses** — an isolated, per-user expense list independent of any group, with create/edit/soft-delete.
- **Dashboard** — net balance hero, outstanding summary, recent activity, recent settlements, and your groups overview.
- **Activity / history** — recent activity feed across your groups.

## Technology stack

- **Frontend** — React 19 + TypeScript + Vite, React Router 7, Axios.
- **Backend** — Node.js + Express 5 + TypeScript (ESM, NodeNext), Mongoose 9.
- **Database** — MongoDB (Atlas in development/production).
- **Auth** — JSON Web Tokens (`jsonwebtoken`) + password hashing (`bcryptjs`).
- **Architecture** — modular monolith: controller → service → model, self-contained modules, no circular dependencies.

## Repository layout

```
.
├── backend/                 Node.js + Express + TypeScript (ESM)
│   ├── src/
│   │   ├── server.ts        app entry (Express app, CORS, request log, /api routes, error handling)
│   │   ├── config/          database connection + validated environment loader
│   │   ├── middleware/      error handler, not-found, request logger
│   │   ├── routes/          `/api` router composition
│   │   ├── modules/         auth · users · groups · expenses · splitting · balances ·
│   │   │                    settlements · notifications · health · common
│   │   └── utils/           shared helpers
│   └── scripts/             self-tests and live smoke scripts
└── frontend/                React 19 + Vite + TypeScript
    └── src/
        ├── features/        auth · users · groups · expenses · balances · settlements ·
        │                    notifications · dashboard
        ├── components/      app layout, shell, shared UI components
        ├── services/        axios instance + token helpers
        └── lib/             shared frontend utilities
```

## Backend API (high level)

All endpoints live under `/api` and are JWT-protected except `/api/auth/register` and `/api/auth/login`:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/PATCH /api/users/me`
- `POST/GET /api/groups`, `GET/PATCH/DELETE /api/groups/:groupId`, group members (invite, respond, roles, remove, leave, transfer, archive)
- `POST/GET /api/groups/:groupId/expenses`, `PATCH/DELETE` expense detail
- `POST/GET /api/expenses/personal`, `PATCH/DELETE` personal expense detail
- `GET /api/groups/:groupId/balances`, `GET /api/balances/...` (net / pairwise / suggestions)
- `POST/GET /api/groups/:groupId/settlements`, `DELETE /api/settlements/:settlementId`
- `GET /api/notifications` (+ filters/pagination), `GET /api/notifications/unread-count`, `PATCH /api/notifications/:notificationId/read`, `PATCH /api/notifications/read-all`
- `GET /api/dashboard`
- `GET /api/health` — liveness/readiness probe

## Local development

Requirements: Node.js ≥ 20 (npm).

1. Backend setup:
   ```
   cd backend
   npm install
   copy .env.example .env      # then fill in the values (see Environment variables)
   npm run dev                 # tsx watch → http://localhost:5000
   ```
2. Frontend setup:
   ```
   cd frontend
   npm install
   npm run dev                 # Vite → http://localhost:5173
   ```
3. Open http://localhost:5173. The frontend calls the backend at `http://localhost:5000/api` by default.

## Environment variables

Backend (`backend/.env` — never commit this file; see `.env.example`):

| Variable           | Required | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `PORT`             | no       | HTTP port (default `5000`)                              |
| `MONGODB_URI`      | yes      | MongoDB connection string, e.g. `mongodb+srv://...`      |
| `JWT_SECRET`       | yes      | JWT signing secret, at least 16 characters (strong random value) |
| `JWT_EXPIRES_IN`   | no       | Token lifetime, e.g. `15m`, `1h`, `7d` (default `7d`)    |
| `NODE_ENV`         | no       | `development`, `test`, or `production` (default `development`) |

Frontend (`VITE_API_URL`, set at **build time**):

| Variable        | Description                                                        |
| --------------- | ------------------------------------------------------------------- |
| `VITE_API_URL`  | Backend base URL for production builds. Defaults to `http://localhost:5000/api`, which is development-only. |

No secrets belong in frontend variables — `VITE_API_URL` contains only the (public) backend URL.

## Production build

```
# backend
cd backend
npm ci
npm run build        # tsc → dist/
npm start            # node dist/server.js   (set NODE_ENV=production)

# frontend
cd frontend
npm ci
VITE_API_URL=https://your-backend-host.example/api npm run build   # tsc -b && vite build → dist/
```

Deployment architecture: **Vercel** serves the static frontend `dist/` (SPA history fallback via `frontend/vercel.json`), **Railway** runs the Node/Express backend with `npm ci && npm run build && npm start`, and the existing **MongoDB Atlas** cluster is reused. The production build itself has been built and verified locally (see Testing); the public deployment is the remaining step.

## Testing / verification completed

- **E2E (T.1)** — live HTTP suite: **176/176 PASS** (auth, groups, all split methods, balances, settlements, notifications, personal expenses, dashboard, data-integrity invariants).
- **Security / edge cases (T.2)** — live HTTP suite: **470/470 PASS**, no genuine vulnerabilities found.
- **UI polish (T.3)** — audit-driven polish; frontend build and lint clean (0 errors).
- **Production build (T.4)** — frontend + backend production builds pass; backend started from its compiled output with `NODE_ENV=production`; `/api/health` → HTTP 200 (database connected); production error responses sanitized; secret/bundle audit passed; live browser sweep of all major routes passed with 0 console errors.
- **Regression** — backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36) and smoke suites green (settlements 48/48, notifications 51/51).

See `docs/MAVI_BUILD_ROADMAP.md` for the full build history and status.

## Security notes

- `.env` files are git-ignored; only `.env.example` (placeholders) is tracked. Never commit real secrets.
- Use a strong, unique `JWT_SECRET` in production (e.g., `openssl rand -base64 48`).
- Run the backend with `NODE_ENV=production` so internal error messages are not returned to clients.
- Authentication is bearer-token based; CORS currently allows `*` with bearer tokens only — acceptable for this auth model, but restrict the origin if/when cookies are introduced.
- The request logger records method/URL/status/duration only — no headers or bodies.
- Documented hardening opportunities (addressed in the roadmap, out of MVP scope): login rate-limiting/account lockout, and a production `CORS_ORIGIN` allow-list.