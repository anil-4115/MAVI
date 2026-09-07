# MAVI BUILD ROADMAP

## MAVI PROJECT

### Product Purpose

MAVI is a group expense-splitting and personal expense management application.

MAVI allows users to:

- create groups
- manage group members
- add shared expenses
- split expenses among participants
- track who owes whom
- record settlements
- manage personal expenses
- receive in-app notifications
- view expense/balance summaries on a dashboard

---

## TECHNOLOGY STACK

Frontend:

- React
- TypeScript
- Vite
- Axios
- React Router

Backend:

- Node.js
- Express
- TypeScript
- Mongoose

Database:

- MongoDB Atlas

Authentication:

- JWT
- bcryptjs

Architecture:

- Modular Monolith
- REST API
- Controller → Service → Model separation

---

## CURRENT IMPLEMENTATION STATUS

### Backend

#### H.1 Common — COMPLETE

- money utilities
- integer minor-unit money handling
- largest-remainder allocation
- pagination
- authorization/object-id guards

#### H.2 Users — COMPLETE

- user search
- user profile
- update own profile/name

#### H.3 Groups — COMPLETE

- group creation
- group listing
- group details
- group update
- members
- invitations
- accept/decline
- roles
- ownership transfer
- member removal/self-leave
- group archive

#### H.4 Splitting — COMPLETE

- Equal
- Quantity
- Exact Amount
- Percentage
- Shares
- Item-wise
- largest-remainder rounding
- exact total invariant
- validation
- deterministic results
- 65/65 self-tests passed

#### H.5 Expenses — COMPLETE

- group expense create (six split methods via Splitting Engine)
- group expense list (paginated, newest-first) / detail
- group expense update/edit (re-split, payer/participant revalidation)
- group expense soft delete (voided — excluded from list/detail)
- personal expense create/list/update/delete (owner-only, payer = creator)
- authorization: creator or group owner can edit/delete; payers/participants must be active members
- archived groups: read-only (create/edit/delete → 409)
- money in integer minor units; invariant `SUM(participantShares.amountMinor) === amountMinor`
- live smoke tests: 72/72 passed

#### H.6 Balances — COMPLETE

- balances always DERIVED from authoritative expense (future settlement) records — no balances collection
- per-user summary (paidMinor / owedMinor / netMinor)
- pairwise netted obligations (one entry per unordered pair, no reciprocal debts)
- group totals (totalExpenseMinor, totalOutstandingMinor)
- deterministic greedy suggested settlements
- settlement input as empty/future-compatible abstraction (H.7)
- claims grouped-balances endpoint: authenticated active member only; archived-group history viewable by authorized members
- excluded from calculations: voided expenses, personal expenses, cross-group data
- dashboard service (`GET /api/dashboard`): personal spending, group paid/owed, net position, group overviews, recent expenses, empty settlements
- payment leverages H.4/H.5 `participantShares` — never recalculates splits
- integer minor units (INR); conservation: sum(paid)=sum(owed)=totalExpense, sum(net)=0
- self-tests 89/89; live smoke tests 76/76 passed (includes authz, archived, cross-group, dashboard)

#### H.7 Settlements — COMPLETE

- `settlements` collection: `group`, `payerId`, `receiverId`, `amountMinor`, `currency` (INR), `date`, `note`, `createdBy`, `status` (`completed`/`cancelled`, default `completed`), timestamps; index `{group:1, date:-1}`
- Direct record + cancel MVP (no pending/confirmation/external provider) per approved decision
- APIs (all under `authenticate`):
  - `POST /api/groups/:groupId/settlements` — any active member records a settlement between two active members (payer != receiver, amount > 0, INR only, archived group rejected)
  - `GET /api/groups/:groupId/settlements` — active member only, paginated, newest first, optional `?status=completed|cancelled`
  - `PATCH /api/groups/:groupId/settlements/:settlementId/status` — completed→cancelled only; creator OR group owner; already-cancelled → 409; record preserved (never deleted)
- Authorization: create/list require an active group member; cancel requires an active member who is the creator or the group owner; removed members cannot create new settlements but historical records remain
- Balance integration (critical): the H.6 `loadSettlementViews` stub now reads real completed settlements; `applySettlements(matrix, views)` subtracts `payer→receiver` amounts from the directed debt matrix; `positionsFromDebtMatrix` derives positions from (settlement-adjusted) edges so pairwise, greedy suggestions, outstanding, and `netMinor` all reconcile. Cancelled settlements have NO effect. Over-settlement is permitted and correctly flips the net pair (documented decision).
- Dashboard: per-group positions and `recentSettlements` (top 10 completed) now carry real data; `sum(paid)=sum(owed)=totalExpense` preserved (expense-only), `sum(net)=0`, integer minor units
- No balances collection; Settlements does not import Balances (one-way: Balances reads Settlements)
- Tests: `npm run build` clean; self-tests `balances-selftest` 89/89 (unchanged semantics), NEW `settlements-selftest` 50/50 (partial/full/over/cancelled/multiple/cross-group/conservation), `splitting-selftest` 65/65
- Live smoke script written (`scripts/settlements-smoke.ts`, ~22 scenarios incl. authz, archived, removed members, dashboard, cross-group); **rerun when MongoDB Atlas is reachable** — blocked this session by `querySrv ECONNREFUSED` (cluster unreachable from this machine)

#### H.8 Notifications — COMPLETE

- `notifications` collection: `recipient`, `type`, `group`, `actor`, `metadata`, `readAt`, timestamps; indexes `{recipient:1, createdAt:-1}` and `{recipient:1, readAt:1}`; no balances collection, never stores derived balances
- Notification types (explicit, roadmap-aligned): `expense_created`, `group_invitation`, `invitation_accepted`, `member_removed`, `member_left`, `role_changed`, `ownership_transferred`, `group_archived`, `settlement_recorded`
- APIs (all under `authenticate`):
  - `GET /api/notifications` — current user's feed, paginated (newest first), optional `?status=all|unread` and `?type=<type>` filters
  - `GET /api/notifications/unread-count` — lightweight unread badge count
  - `PATCH /api/notifications/:notificationId/read` — mark one read (recipient-only; idempotent; non-recipient/unknown → 404)
  - `PATCH /api/notifications/read-all` — mark all of the user's unread as read, returns `modifiedCount`
- Generation: centralized in the Notifications module (pure `notification.events.ts` builders + fire-safe `notify` wrapper in `notification.service.ts`); groups/expenses/settlements services call it AFTER a successful mutation. One-way dependency (those modules import Notifications; Notifications imports nothing back) — no circular deps. Notification failures are logged and never break the core mutation.
- Recipient policy: invitations → invitee; accept/leave → active owner+admin; removal → removed member; role/ownership change → the affected member; expense/archive → every other active member; settlement → payer & receiver (actor never self-notified)
- No notifications for: invitation decline, personal expenses, expense update/void, settlement cancel (kept to roadmap-enumerated events)
- H.7 service-level validation & INR integer-minor-unit rules preserved (amounts embed the already-validated integers)
- Tests: `npm run build` clean; NEW `notifications-selftest` 36/36 (pure event builder + recipient-selector tests, no DB); existing `splitting-selftest` 65/65, `balances-selftest` 89/89, `settlements-selftest` 50/50 all unchanged
- Live smoke (Atlas): `scripts/notifications-smoke.ts` 51/51 (invite→accept→decline, role change, expense, settlement, removal, leave, ownership transfer, archive, mark-read/read-all/pagination/filters/authorization/17-record total); `settlements-smoke.ts` re-verified 48/48; smoke data isolated (`@mavi-smoke.test`) and cleaned up (notifications closed in cleanups)

### Frontend

#### Authentication — COMPLETE

- Login
- Register
- AuthContext
- JWT session handling
- GuestRoute
- ProtectedRoute
- Logout
- Dashboard placeholder

#### F.1 App shell, API foundation & foundations — COMPLETE

- Application shell: responsive sidebar navigation (desktop) / drawer + top bar (mobile), brand, active-route state, current-user chip, logout, unread-notifications badge in the nav (60s polling), Next step = F.2 onward
- Central Axios config (`src/services/api.ts`): JWT bearer attach, 401 → clears token + notifies the auth context (session torn down, ProtectedRoute redirects to /login), `getErrorMessage` normalization; feature API services (`src/features/*/api/*Api.ts`) keep components free of request logic
- Routing (React Router): `/dashboard`, `/groups`, `/groups/:groupId`, `/notifications` under a protected, unread-aware `AppLayout`; `/login`, `/register` guest routes preserved; unknown paths → `/dashboard`
- Dashboard (`GET /api/dashboard`): summary cards (overall net, paid, owe, to-receive, to-pay, personal spending), groups overview (net/outstanding/role/members), recent group expenses, recent personal expenses, recent settlements; loading/error/empty states; no invented fields
- Groups foundation: list cards (name, description, member count, role), create-group form (client validation mirrors backend), detail page with archive banner + role badges; Overview tab (group balances summary: total expense, outstanding, my paid/owed/net) and Members tab (name, email, role, status, joined) fully backed by APIs; Expenses/Balances/Settlements/Activity tabs exist as structured placeholders (F.4/F.5/F.6/F.7)
- Notifications foundation: feed (`GET /api/notifications`) with All/Unread filters, per-type descriptions from metadata, mark-one-read + mark-all-read (`PATCH`), paginated "Load more"; unread badge (`GET /api/notifications/unread-count`) in the shell
- Money display: integer minor units from the backend are formatted for display with integer math only (`src/lib/money.ts`); no frontend financial calculations
- Verification: `npm run build` clean; `npx oxlint` clean (no errors); live temp contract check 25/25 against the running backend covering auth/me, dashboard (empty + post-expense numbers), groups list/create/detail/members, balances, notifications list/unread-count/mark-read/read-all with cleanup; backend self-tests unchanged (splitting 65/65, balances 89/89, settlements 50/50, notifications 36/36); Vite dev server serves HTTP 200
- Committed in `90be2ce` (with the full F.1 frontend foundation)

#### F.2 Real dashboard — COMPLETE

- Real dashboard built entirely on the existing `GET /api/dashboard` endpoint via the F.1 `dashboardApi.ts` service/types (reused unchanged; no backend changes)
- Net-position hero (`NetHero`): prominent overall net card, sign-tinted (success/danger/neutral), backed only by backend `overallNetMinor`/`groupSumToReceiveMinor`/`groupSumToPayMinor`/`groupCount`; descriptive sentence derived from sign, zero frontend math
- Summary grid: paid, owe (bad-when-positive), to-receive, to-pay (bad-when-positive), personal spending — printf `formatMoney` integer-minor-unit display only
- Drill-downs: group rows link to `/groups/:id`; recent group expenses deep-link to their group detail; "All groups" shortcut; reusable `.row--link` affordance added to the design system
- Recent activity sections: recent group expenses (title, group, relative date, amount+currency), recent personal expenses, recent settlements (direction label from payer/receiver ids, amount, short group id)
- States: loading spinner, API-error `ErrorState` with retry, per-section `EmptyState`s with guidance; existing AppLayout/auth/routing/notification badge untouched and working
- Responsive: hero + summary grid reflow, rows wrap their meta on ≤560px (applied to all shared `.row` lists)
- Verification: `npm run build` clean; `npx oxlint` clean (no errors; only pre-existing benign `set-state-in-effect` warnings); live HTTP contract check 34/34 against the running backend (seeded 2 users + group + ₹500 equal-split expense + B-pays-A ₹100 settlement; asserted A: paid 50000/owed 25000/to-receive 15000/net 15000, B: to-pay 15000/net −15000, group overview, recent expenses/settlements; seed data cleaned up); backend self-tests unchanged green (splitting 65, balances 89, settlements 50, notifications 36)
- Not committed yet — working tree left uncommitted for review

### Finalization

- End-to-end testing — NOT STARTED
- Security review — NOT STARTED
- UI polish — NOT STARTED
- Production build — NOT STARTED
- Deployment — NOT STARTED
- Documentation — NOT STARTED

---

## APPROVED BUSINESS DECISIONS

1. **Settlement workflow:**
   Direct record + cancel for MVP.
   No pending/confirmation workflow.

2. **Money:**
   Use INR as the default/current currency.
   Store money as integer minor units.
   Example:
   ₹10.50 = 1050.
   Never use floating-point money for financial calculations.

3. **Item-wise splitting:**
   Each item is split equally among its assigned participants.
   Use largest-remainder rounding.

4. **Balance storage:**
   Do NOT create a balances collection for MVP.
   Balances are derived from authoritative expense and settlement records.

5. **Group deletion:**
   Archive groups instead of hard deleting them.
   Historical expenses and settlements must remain available.

6. **Invitations:**
   MVP invitations are only for registered users.
   No email provider, invitation codes, or external email service yet.

7. **Expense edit/delete:**
   Only the expense creator or group owner can edit/delete a group expense.

8. **Removed members:**
   Historical expense shares and settlement history remain.
   Removed members cannot participate in new group operations.

9. **Personal expenses:**
   Personal expenses belong only to their owner.
   Payer = creator.
   Multi-person expenses use a group.

---

## CORE BUSINESS FLOW

For a group expense:

```
authenticate
→ authorize group membership
→ validate request
→ verify payer and participants
→ select split method
→ calculate shares using Splitting Engine
→ validate share total
→ save expense
→ generate notifications
→ balances are derived from expense/settlement history
```

The Splitting Engine is pure business logic and must not depend on Express, MongoDB, or HTTP.

---

## APPROVED SPLITTING METHODS

**Equal:**
Divide equally using largest-remainder allocation.

**Quantity:**
Calculate proportional shares using quantities.

**Exact:**
User-provided amounts must exactly equal the expense total.

**Percentage:**
Percentages must total exactly 100%.

**Shares:**
Calculate proportional shares based on positive integer share weights.

**Item-wise:**
Items must total the expense amount.
Each item is equally split among its assigned participants.
Participant totals are aggregated.

**Invariant:**

```
SUM(participantShares.amountMinor) === expense.amountMinor
```

must always be true.

---

## APPROVED DATABASE DESIGN

**User:**
Managed by Auth module.

**Group:**

- name
- description
- currency
- createdBy
- members[]
- archived
- archivedAt

**Expense:**

- group
- createdBy
- title
- amountMinor
- currency
- expenseDate
- payerId
- splitMethod
- splitInput
- participantShares[]

**Settlement:**

- group
- payerId
- receiverId
- amountMinor
- currency
- date
- note
- createdBy
- status

**Notification:**

- recipient
- type
- group
- actor
- metadata
- readAt

No Balance collection in MVP.

---

## APPROVED MODULE ARCHITECTURE

**Backend:**

```
backend/src/modules/

auth/
users/
groups/
splitting/
expenses/
balances/
settlements/
notifications/
common/
```

**Frontend:**

```
frontend/src/features/

auth/
dashboard/
groups/
expenses/
balances/
settlements/
notifications/
```

---

## IMPLEMENTATION ORDER

**Backend:**

- H.1 Common — DONE
- H.2 Users — DONE
- H.3 Groups — DONE
- H.4 Splitting — DONE
- H.5 Expenses — DONE
- H.6 Balances — DONE
- H.7 Settlements — DONE
- H.8 Notifications — DONE

**Frontend:**

- F.1 App shell/navigation — DONE
- F.2 Real dashboard — DONE
- F.3 Groups
- F.4 Expenses + splitting interface
- F.5 Balances
- F.6 Settlements
- F.7 Notifications

**Final:**

- T.1 End-to-end testing
- T.2 Security/edge-case testing
- T.3 UI polish
- T.4 Production build
- T.5 Deployment
- T.6 Documentation

---

## DEVELOPMENT RULES

- Never modify `backend/.env` automatically.
- Never expose secrets.
- Never put `JWT_SECRET` in frontend code.
- Use TypeScript.
- Preserve modular monolith architecture.
- Do not rewrite working modules unnecessarily.
- Do not install dependencies unless necessary.
- Build incrementally.
- Complete and test one major module before starting the next.
- Run build/tests after every major backend module.
- Clean database test data after smoke tests.
- Keep authoritative financial records in expenses and settlements.
- Do not store derived balances as primary truth.
- Use integer minor units for all money.
- Keep splitting calculations deterministic.
- Do not create circular module dependencies.
- Keep controllers thin.
- Keep business logic in services.
- Keep frontend API calls separate from UI components.
- Update this roadmap after every completed major step.

---

## HOW TO CONTINUE AFTER A BREAK

When returning to the project after hours/days:

1. Read `AGENTS.md`.
2. Read `docs/MAVI_BUILD_ROADMAP.md`.
3. Inspect the current repository.
4. Determine the first incomplete implementation step.
5. Do not repeat completed work.
6. Summarize the current status.
7. Continue only from the first incomplete step.
8. Run verification after implementation.
9. Update this roadmap.
10. Stop and wait for approval before starting the next major step.

---

## CURRENT NEXT STEP

### F.2 — Real dashboard (COMPLETE)

The dashboard is now a polished real dashboard backed entirely by the live
`GET /api/dashboard` endpoint: a sign-tinted net-position hero, the F.1 summary
grid, and drill-down links from groups and recent group expenses into group
detail, with loading/error/empty states and mobile responsiveness — verified
34/34 against the running backend. Working tree uncommitted, pending review.

**Next major step: F.3 — Groups polish** (extend group list/detail with deeper
group management and affordances now that the dashboard drills into groups).