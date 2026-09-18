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

#### H.9 Reports — COMPLETE

- New `reports` module: `GET /api/reports/summary` (router-level `authenticate`). Read-only and fully DERIVED at request time — no Report collection, no stored aggregates, no new indexes
- Query contract: `?scope=all|group|personal&groupId=&from=YYYY-MM-DD&to=YYYY-MM-DD`; `from`/`to` are inclusive UTC-day bounds (default = current UTC calendar month); omitted `from`/`to` returns the default range echoed in `range`
- Authorization & isolation: unauth → 401; a specific `groupId` requires an active membership → uniform 404 for non-members/unknown ids (same convention as every group read); `groupId` alone implies `scope=group` (personal spending never leaks); personal scope is owner-only (`group:null` + `createdBy=actor`); archived groups remain readable/reportable by active members (historical read, matching H.3/H.6 semantics)
- Aggregation (integer minor units only): totals (`totalSpentMinor`, group/personal split, `expenseCount`), actor rollups (`paidMinor`/`owedMinor`/`netMinor`), completed-settlement count/total scoped to the range, keyword category breakdown (reuses the analytics classifier), per-group rows, and an authorized newest-first `transactions` list (the CSV/PDF export source)
- Reuse (no duplicated financial logic): analytics `classifySpendingCategory`/`orderedCategories`; balances `computeDebtMatrix` + `applySettlements` + `positionsFromDebtMatrix` for settlement-adjusted actor nets; common `DEFAULT_CURRENCY`; `requireObjectId` guard
- Validation: bad `scope`/dates/`groupId` format, `from > to`, `from` without `to`, `scope=group` without `groupId`, and `groupId` combined with `scope` not `group` → 400
- Tests: `scripts/reports-smoke.ts` **81/81** live (authz 401/404, scope/param 400s, range inclusivity + out-of-range exclusion, archived history, group/personal isolation incl. a member's personal never leaking, settlement-adjusted nets, integer-money assertion, transaction typing/sorting); `scripts/export-selftest.ts` **48/48** pure (CSV escaping/CRLF/filename + PDF structure/xref/stream-length/ASCII safety); existing selftests + smokes all unchanged green

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
- Committed in `8e95592`

#### F.3 Groups polish — COMPLETE

- Full group management surface wired to the real group APIs with no backend changes
- Groups list: role badges color-coded by role (owner accent, admin success, member muted) and create-group form now share the F.3 validators (`src/features/groups/lib/validators.ts`); archived groups excluded by the API
- Group detail: `myRole` gated settings (owner/admin) — edit name/description (`PATCH /groups/:id` via `updateGroup`), archive (owner only, `DELETE /groups/:id`), all destructive actions confirmed through a reusable `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`)
- Members management (`MembersTab`): invite via search (`GET /users/search?q=` through new `src/features/users/api/usersApi.ts`) + `POST /groups/:id/members` (owner/admin), role badges, make admin/member + transfer ownership (`PATCH /groups/:id/members/:userId/role`, `PATCH /groups/:id/owner`, both owner-only), remove/leave/cancel-invite (`DELETE /groups/:id/members/:userId`), "You" inline badge, invited badges; declined members filtered by the API; non-privileged members only see active lists and management actions
- Invited guests without membership see a preview card (`GET /groups/:id/preview`) with Accept/Decline (`POST /groups/:id/members/:userId/accept|decline` via `acceptInvitation`/`declineInvitation`); detail route falls back to the preview whenever membership detail is refused
- Transient bank-building message and ComingSoon placeholders retained to communicate roadmap boundaries (expenses F.4, balances F.5, settlements F.6, activity F.7)
- Verification: `npm run build` clean; `npx oxlint` clean (no errors; only pre-existing benign `set-state-in-effect` warnings); live HTTP contract check 51/51 against the running backend covering update, archive, invite/preview/accept, member-list visibility (invited hidden from non-privileged), role promote/demote/invalid-owner, admin invites, remove/cancel/leave, ownership transfer (demotes old owner to admin), archive (owner-only) + list exclusion, and permission denials for non-members/invited/plain members; seed data cleaned (0 leftover `@mavi-f3.test` users); backend self-tests unchanged green (splitting 65, balances 89, settlements 50, notifications 36)
- Not committed yet — working tree left uncommitted for review

#### F.4 Expenses + splitting interface — COMPLETE

- Real group-expense tab inside `GroupDetailPage` (replaces the F.4 ComingSoon placeholder) built on the existing expense APIs — no backend changes
- Service layer (`src/features/expenses/api/expensesApi.ts`): `listGroupExpenses` (paginated), `getGroupExpense`, `createGroupExpense`, `updateGroupExpense`, `deleteGroupExpense` (soft void), typed payloads mirroring the backend contract (`amountMinor` minor units split in minor units)
- Money/date input helpers (`src/features/expenses/lib/input.ts`): rupee-string ↔ integer-minor-unit parse with integer math only, ISO date <-> `input[type=date]` conversion, no frontend financial calculations
- `ExpenseForm` (create + edit): title/amount/date/payer + all six split methods (Equal, Quantity, Exact, Percentage, Shares, Itemwise) with per-method entry editors and participant checkboxes limited to the group's active members; live feedback (exact sum vs total, percentage total, per-item amounts, share/quantity weights); validation mirrors the backend rules (positive integer minor units, percentages total 100 across two decimals, exact/item amounts total the expense, duplicate-user rejection)
- `ExpensesTab`: newest-first paginated list (20/page, Load more), expandable detail row (fresh `getGroupExpense` per expansion, participant shares + split input), Edit + Void actions gated to `expense.createdBy === currentUserId || myRole === 'owner'` via confirm dialogs, archived groups read-only (no create/edit/void), loading/error/success/empty/confirmation states, responsive ≤640px layout consistent with the MAVI design system
- Integrations honored: balance/notification effects come from the backend (expense creation re-derives balances; `expense_created` notifications go to other active members) — verified live
- Verification: `npm run build` clean (133 modules) and `npx oxlint` clean (no errors; only the pre-existing benign class of `set-state-in-effect` data-fetch warnings, none functional); backend `tsc` clean; backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36); live HTTP contract check 74/74 against the running backend covering: all six split methods' `participantShares` (equal 3-way, quantity 1:2, exact, percentage 33.33/33.33/33.34, shares 1:2:3, itemwise aggregation), balance integration (A paid 470000/owed 156663/net 313337; B owed 184997/net −184997; `totalExpenseMinor` 470000; conservation `sum(net)=0`), `expense_created` notifications for B with metadata title, pagination (`?page=2&limit=2` → total 11/totalPages 6, default page lists all), detail fetch, updates (title-only, equal amount-only re-split, payer change, exact amount-only → 400, exact full update with re-split), permission denials (member update/void → 403), void (detail → 404, list total drops), archived-group create/update/void → 409, validation 400s (zero/negative/empty title, percentage summing to 90, exact/itemwise sum mismatch, invited participant/payer, non-member actor 403 + participant 400), plus regression smoke 13/13 (auth register/login/me, dashboard, groups list/detail/create, invite preview/accept/decline, members active status, role promote, ownership transfer, notifications unread-count) and user search; all seed data cleaned (0 leftover `@mavi-f4*.test` users, groups, expenses, settlements, notifications); temp scripts deleted
- Not committed yet — working tree (F.3 + F.4) left uncommitted for review

#### F.5 Balances UI — COMPLETE

- Real Balances tab inside `GroupDetailPage` (replaces the F.5 ComingSoon placeholder) consuming the existing `GET /api/groups/:groupId/balances` endpoint — no backend changes
- Service layer (`src/features/balances/api/balancesApi.ts`): full typed contract copied from `backend/src/modules/balances/balances.types.ts` — `group`, `totalExpenseMinor`, `totalOutstandingMinor`, `currentUser`, `members` (all involved, `active` flag), `pairwise` (sign-convention preserved), `suggestedSettlements` (from→to), `settlements` (completed, newest first); `getGroupBalances(groupId)` active-member-only call
- `BalancesTab`: summary grid (total expense, outstanding, you paid, your share, your net — tinted by sign), "Who owes whom" split into **You owe** / **Owed to you** / **Between others** sub-lists derived purely from backend `pairwise.netMinor` (direction + abs formatted, no recomputation), "Suggested settlements" rendered as directional rows from `suggestedSettlements`, "Member balances" listing every involved member (paid/share/net, `you` accent badge, `left` badge for removed members), and "Recent settlements" from the backend `settlements` list; `totalExpenseMinor === 0` → "No balances yet" EmptyState; non-empty but no pairwise → "All settled" zero-balance EmptyState; loading `Spinner`, `ErrorState` with retry, archived-group read-only hint
- Respects backend rules: money displayed in integer minor units via `formatMoney` only; no Balance model/collection, no storage, no floating-point arithmetic; authorization and archived visibility enforced entirely by the backend (403 for non-members; archived groups remain viewable read-only)
- Design system: reuses `summary-grid`/`summary-card`, `.section`, `.rows`/`.row`, `.badge`, `.empty-state`, `.error-state`, `.spinner` from ui.css; new `balances.css` only adds the sub-list grid + heading/badge/note primitives; responsive via `repeat(auto-fit, …)` reflow and shared `.row` wrap rules
- Verification: `npm run build` clean (136 modules) and `npx oxlint` clean (no errors; only the app-wide benign `set-state-in-effect` data-fetch warnings — the new exhaustive-deps hint was fixed by `useCallback`); backend `tsc` clean; backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36); live HTTP contract check 44/44 against the running backend covering: positive balance (A net +185000 → +175000 after settlement), negative balance (B −55000 → −45000, C −130000), zero balance (D at 0), multiple participants (4-member `members` + correct `pairwise`), settlement-adjusted balances (`settlements` list, pair −45000, outstanding 175000, suggestions C→A 130000 + B→A 45000), settlement suggestions, group isolation (G2 expense left G1 untouched, G2 pairwise A/E +10000), removed-member history (`active:false`, net preserved), archived-group behavior (still served with `archived:true`, create → 409, non-member → 403), plus `GET` authorization denials; regression smoke 17/17 (auth register/login/me, dashboard, groups create/list/detail, invite preview/accept/decline, members active, expenses equal split reflected in balances, role promote, ownership transfer, notifications unread-count); all seed data cleaned (0 leftover `@mavi-f5*.test` users/groups/expenses/settlements/notifications); temp scripts deleted
- Not committed yet — working tree (F.3 + F.4 + F.5) left uncommitted for review

#### F.6 Settlements UI — COMPLETE

- Real Settlements tab inside `GroupDetailPage` (replaces the F.6 ComingSoon placeholder) consuming the existing `GET/POST /api/groups/:groupId/settlements` + `PATCH /api/groups/:groupId/settlements/:id/status` surface — no backend changes
- Service layer (`src/features/settlements/api/settlementsApi.ts`): typed contract copied from `backend/src/modules/settlements/settlement.types.ts` — `PublicSettlement` (payer/receiver/amountMinor/date/note/createdBy/status/timestamps), paginated `listSettlements` with optional `?status=completed|cancelled`, `createSettlement` (201), `cancelSettlement` (creator/owner-only, completed→cancelled, record preserved)
- `SettlementForm`: overlay dialog reusing the shared `.dialog` scaffolding — payer/receiver selects (active members only, `(you)` suffix, payer≠receiver enforced with auto-correction), rupee text amount (existing `parseRupeesToMinor`/`minorToRupeesText`), date (shared `input` helpers, defaults to today), optional note (≤300); prefill from a backend suggested transfer with a source hint and fully editable fields; mirrors ExpenseForm validation/busy/error handling
- `SettlementsTab`: history rows show direction relative to the current user ("You paid X" / "X paid you" / "X paid Y"), formatted date + note, amount (integer minor units via `formatMoney`), and a completed/cancelled status badge; All/Completed/Cancelled filters drive the backend `?status=` param; paginated history (20/page, Load more); EmptyState per filter; loading `Spinner`; `ErrorState` with retry; "Record settlement" (hidden when archived, disabled with <2 active members); a "Suggested settlements" section sourced ONLY from `getGroupBalances(...).suggestedSettlements` (backend-derived, never recomputed) with per-row **Record** shortcut that prefills the form; cancel via `ConfirmDialog` gated to `createdBy === me || myRole: owner` on completed records
- Balance refresh: after recording/cancelling, the tab refetches the settlement list AND the backend balances (so suggestions stay current) and calls the page's `onGroupChanged` so other mounted sections reflect the new state — no local money math anywhere
- Respects backend rules: any active member can record between two active members; archive blocks create (409, UI hides the record action + hint) while read stays available and — exactly as the backend defines (no archived guard on PATCH) — cancellation of an existing record remains allowed in archived groups; non-member/creator/owner permissions and integer minor-unit validation are enforced server-side
- Design system: reuses `.rows`/`.row`, `.badge`, `.btn`, `.field`, `.form__actions`, `.dialog`/`.form-hint` from ui.css/expenses.css; new `settlements.css` only adds the toolbar, status filters, row layout (`info`/`aside`), more/note primitives and the dialog two-up grid; responsive via shared `.row` wrap + a 560px single-column fallback
- Verification: `npm run build` clean (140 modules) and `npx oxlint` clean (no errors; the one new warning in SettlementsTab is the same app-wide benign `set-state-in-effect` data-fetch category — the data fetch is wired through a `useEffect` per the established pattern); backend `tsc` clean; backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36); live HTTP contract check 79/79 against the running backend covering: empty list + invalid status filter, create with note/date (201, completed), notifications fired to payer+receiver only (actor excluded), balances/suggestions re-derived after every record + cancel (outstanding 1600→1200→1000→…→1600, single adm-payer suggestion set as the UI "prefill" source), list + `?status=` + pagination (page-2 empty), cancel gates (403 for plain member/unrelated member, 200 by creator and 200 by owner, 409 double-cancel, 404 unknown settlement/group), validation (payer=receiver, 0/negative/float/non-numeric amount, non-member payer/receiver → 400), permissions (401 unauthenticated, 403 non-member list/create), archived (create → 409, list/balances still readable, cancel still allowed per backend), cross-group isolation (G2 settlements never touch G1), integer precision (₹100.50 round-trips as 10050), no-currency/no-note defaults; regression smoke green (settlements-smoke 48/48, notifications-smoke 51/51); all seed data cleaned (0 leftover `@mavi-f6.test` users/settlements); temp verification script deleted
- Not committed yet — working tree (F.3 + F.4 + F.5 + F.6) left uncommitted for review

#### F.7 Activity & Notifications UI — COMPLETE

- Replaced the F.5 Activity placeholder in `GroupDetailPage` with a real **ActivityTab** (group-scoped): consumes `GET /api/notifications` and client-filters by the backend-returned `group` id (`notification.group === groupId`) with auto-advancing pages until a match or exhausted, Load more, All/Unread tabs, unread highlight + mark-as-read, and EmptyState/ErrorState/Spinner — no local money math
- Polished `NotificationsPage` into a full notification center: `.describe` lib (`src/features/notifications/lib/describe.ts`) with recipient-centric phrasing ("You paid/received" only when `payerId`/`receiverId` === current user), `NOTIFICATION_TYPE_LABELS` + per-row type badge, server-side `?type=` filter, deep links to the owning group, and success/error feedback banners
- Deep-link design `notificationTarget`: `/groups/{group}` always (real backend id); `expense_created` appends `?tab=expenses`, `settlement_recorded` appends `?tab=settlements` (only from backend-returned ids, never guessed). `GroupDetailPage` parses `?tab=` via `useSearchParams` with an `isTabId` guard and only syncs when the URL tab changes so in-page clicks aren't overridden
- Read surface: `PATCH /notifications/:id/read` (mark one), `PATCH /notifications/read-all` (mark all, disabled client-side when unread total is 0), `GET /notifications/unread-count` (badge via `UnreadCountProvider`); list supports `?status=unread` and `?type=` filters + pagination — all backend-driven, no new backend changes
- New `notifications.css` primitives (toolbar, type filter, info/actions/time layout, type badge, mobile fallback); deleted unused `ComingSoonTab.tsx`; components never call axios directly (api layer only), reuses Spinner/EmptyState/ErrorState/Banner/ConfirmDialog + ui.css `.rows`/`.row`/`.badge`/`.btn`/`.tabs` primitives with the shared ≤560px `.row` wrap
- Conventions: `import type` for types (verbatimModuleSyntax), no enums (erasableSyntaxOnly), integer minor units with `formatMoney`/`parseRupeesToMinor` only, feature-based organization, no new dependencies
- Verification: frontend `npm run build` clean (141 modules) and `npx oxlint` clean (only the pre-existing app-wide benign `set-state-in-effect` data-fetch warnings); backend `tsc` clean; backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36); live HTTP check **64/64** against the running backend covering: 401 unauthenticated, full group-activity scenario across two groups G1/G2 (A owner/B admin/C member/D invitee) proving per-user G1-scope type sets (A: invitation_accepted, expense_created, settlement_recorded, member_left, group_archived), cross-group isolation (A's G2 scope = invitation_accepted + expense_created only, no G1 leakage), actor-exclusion (C gets no group_archived), metadata ids (expenseId/title/groupName; settlementId/payer/receiver/amountMinor; role; removedMemberId; inviteeId) for deep links, `?status=unread` / `?type=` single + combined filters, invalid type → 400, pagination (page 2 distinct, beyond-range empty), mark-one-read (unread-count decrement, re-read idempotent, unknown → 404, cross-user → 404), mark-all-read (recipient-scoped modifiedCount — other users' unread untouched), and archived-group activity still viewable + scoped; regression green (notifications-smoke 51/51, settlements-smoke 48/48); all seed data cleaned (0 leftover `@mavi-f7.test` users/notifications); temp verification script deleted
- Not committed yet — working tree (F.3 + F.4 + F.5 + F.6 + F.7) left uncommitted for review

#### F.8 Personal Expenses UI — COMPLETE

- New dedicated **Personal expenses** page + route `/expenses/personal` (under `ProtectedRoute`/`AppLayout`), with a "Personal expenses" item added to the sidebar + mobile drawer navigation (`AppLayout`) between Groups and Notifications — entirely frontend, no backend changes
- API service layer extended in the existing `src/features/expenses/api/expensesApi.ts`: `listPersonalExpenses`, `getPersonalExpense`, `createPersonalExpense`, `updatePersonalExpense`, `deletePersonalExpense` + `CreatePersonalExpensePayload`/`UpdatePersonalExpensePayload`; reuses the existing `PublicExpense` type (exact H.5 response shape). Components never call axios directly
- Consumed H.5 endpoints exactly as built: `POST/GET /expenses/personal` and `GET/PATCH/DELETE /expenses/personal/:expenseId`. Fields used are only what the backend supports — `title` (1–120, trimmed), `amountMinor` (positive integer), `expenseDate` (defaults to today server-side); **no category field** exists on the backend so none is invented; currency stays INR (backend default, non-INR rejected server-side)
- `PersonalExpenseForm` (create + edit): title / amount (₹) / date inputs reusing `parseRupeesToMinor`/`minorToRupeesText`/date helpers (integer minor units only, no floats); client validation mirrors the backend rules (title 1–120, positive amount, valid date) without duplicating any business/split logic; busy/error handling + Cancel consistent with `ExpenseForm`
- `PersonalExpensesPage`: initial `Spinner`, `ErrorState` with retry, "Add expense" header/empty-state actions, paginated list (20/page, "Load more"), rows show title + date + amount (`formatMoney`), **Edit** prefills the form, **Delete** confirmed through the shared `ConfirmDialog`, success banners after add/update/delete, action-error banner, and the list is refreshed (`loadFirstPage`) after every mutation so create/update/delete are always reflected; desktop + mobile responsive (new minimal `personal-expenses.css` for the two-up form row and row meta/actions, everything else reuses `app-page`/`page-header`/`card`/`form`/`field`/`rows`/`row`/`banner`/`empty-state`/`spinner`/`expenses.css`)
- Backend semantics honored: personal delete is a **soft void** (list/detail exclude voided automatically), ownership is enforced server-side (cross-user access → 404), personal expenses generate **no** notifications, and `GET /api/dashboard` personal spending keeps reflecting the records
- Verification: `npm run build` clean (144 modules) and `npx oxlint` clean (no errors; the one new warning is the same app-wide benign `set-state-in-effect` data-fetch category every page has); backend `tsc` clean; backend self-tests green (splitting 65, balances 89, settlements 50, notifications 36); **live HTTP check 81/81** against the running backend covering: 401 for all five endpoints, empty list, create (201; group null / createdBy+payer = owner; currency default INR; single self-share == amount; title trimming; ₹100.50 → 10050 round-trip; missing date defaults to today), 16 validation 400s (empty/missing/blank/121-char title, missing/zero/negative/float/string amount, USD currency, bad date) incl. rejected personal extras (payerId / split / group / participantShares → 400), list ordering newest-first + pagination (page2 + beyond-empty + limit cap 100), detail (200 / invalid id 400 / unknown 404), update (title / amountMinor with self-share re-derivation / date; empty update 400; extra-field 400; unknown → 404), ownership isolation (B's empty list; B detail/update/delete of A's expense → 404 with valid bodies), **no notifications generated** for either user, dashboard integration (personalSpendingMinor = sum after create + after edit; recent list; drops after delete), delete soft-void (list + detail drop, double-delete 404); Vite dev server serves `/expenses/personal` (SPA shell 200); all seed data cleaned (0 leftover `@mavi-f8.test` users/expenses); temp verification script deleted
- Regression green: notifications-smoke 51/51 and settlements-smoke 48/48 (auth, dashboard, groups create/list/detail, invitations/accept/decline, roles, ownership transfer, archive, expenses, balances conservation, settlements, notifications read/mark-all/filters/pagination, cross-group isolation)
- Not committed yet — working tree (F.3 + F.4 + F.5 + F.6 + F.7 + F.8) left uncommitted for review

#### F.9 Reports + Export — COMPLETE

- Reworked `ReportsPage` from the thin monthly-analytics wrapper into a full Reports surface (the nav item/section was renamed "Analytics" → "Reports", route `/reports` unchanged); no backend changes beyond the new H.9 endpoint it consumes
- Filter card: `from`/`to` date inputs (client + server validation, inclusive-day semantics), scope segmented control (All / Personal only), and a group selector (active + archived groups merged from `listGroups`); Apply/Reset with inline validation error for an inverted range
- Report sections: `ReportSummaryCards` (total/group/personal spend, You paid, Your share, sign-tinted Net position, Settlements), category breakdown reusing `CategoryDonutChart` + `CATEGORY_COLORS`, `ReportGroupBreakdown` (per-group spent / paid / share / net / settlements, archived badge), and a `ReportTransactions` preview (newest-first, truncation note pointing at export); loading `Spinner`, `ErrorState` retry, and `EmptyState` for an empty range
- Exports (dependency-free — no new npm packages): `src/lib/csv.ts` (RFC 4180 escaping, CRLF records, UTF-8 BOM download, sanitized filenames) and `src/lib/pdf.ts` (minimal PDF 1.4 text writer — catalog/pages/Helvetica + Helvetica-Bold, automatic pagination, correct object offsets/xref/trailer, ASCII/WinAnsi-safe text with `Rs` money); `features/reports/utils/reportExport.ts` maps the authorized `ReportSummary` onto CSV rows / PDF text lines so exports can never disagree with the on-screen integers
- Conventions honored: backend aggregates every number, the frontend only formats/serializes (`formatMoney`, integer minor units); typed API layer (`reportsApi.ts`) + `useReportSummary` hook; `import type` (verbatimModuleSyntax); no enums; all figures come from the endpoint's already-authorized line items
- Responsive: filter grid collapses to 2-up ≤760px and single-column ≤420px, transaction rows stack their amount/payer; all themes (light/dark/blue/system) via existing tokens; reuses `.card`/`.summary-grid`/`.summary-card`/`.field`/`.form`/`.btn`/`.badge`/`.segmented`/`.empty-state`/`.error-state`/`.spinner` with a minimal `reports.css`
- Verification: frontend `npm run build` clean (178 modules) + `npx oxlint` 0 errors (same benign app-wide `set-state-in-effect` data-fetch warning category); backend `npm run build` clean; H.9 `reports-smoke` 81/81 and pure `export-selftest` 48/48; full regression green — all 8 pure selftests (attachment-validation 37, auth-email 39, balances 89, log-redaction 12, notifications 39, password-reset 44, settlements 50, splitting 65) and all 12 live smokes (attachment 48, auth-bruteforce 40, auth-verify 27, authorization 79, group-lifecycle 91, notifications 51, password-reset 38, profile 53, rate-limit 41, reports 81, security-headers 141, settlements 52); smoke data auto-cleaned (`@mavi-reports-smoke.test`)
- Not committed yet — working tree (F.3–F.9 + T.1–T.4 + H.9) left uncommitted for review

### Finalization

- **T.1 End-to-end testing — DONE**
  - Full integrated E2E suite executed as a live **HTTP-only** scenario against the running backend (`http://localhost:5000/api`) + MongoDB Atlas — **176/176 PASS** — driving registration/login, group lifecycle (create/preview/edit/archive, invites, accept/decline, members, roles, ownership transfer), all six split methods with balance/settlement reconciliation through recalculation and voiding, settlements (create, net effect, cancel by payer 409, double-cancel 409, owner board-cancel), personal expenses (create/edit/soft-void/isolation), the full notifications surface (type/status filters, unread-count, read, read-all, recipient exclusion policy), and DB-level data-integrity invariants (SUM(shares)==amount, soft-void bookkeeping, notification counts per action, cross-group isolation, integer minor units), with a verified 0-leftover cleanup. Every "got X" mismatch on first run was traced to an incorrect script expectation (a missed E5 edge in a manual pairwise sum, an unread-count assertion placed after subsequent notifications arrived, a forgotten settlement notification, a body-less PATCH hitting 400 before the 404 lookup, and a pre-clean regex that did not match the generated email pattern) — **no product bugs were found**; corrected script re-ran clean
  - Frontend navigation verified: Vite serves the SPA shell (HTTP 200, title MAVI) for `/`, `/login`, `/register`, `/dashboard`, `/groups`, `/groups/:id`, `/expenses/personal`, `/notifications`; route guards (guest redirect on auth pages, protected shell elsewhere) source-verified
  - Regression green on the same stack: notifications-smoke 51/51, settlements-smoke 48/48; backend self-tests splitting 65, balances 89, settlements 50, notifications 36
  - Builds clean: frontend `npm run build` (144 modules) + oxlint (warnings only, the benign app-wide `set-state-in-effect` data-fetch category), backend `tsc` clean
  - Test data cleaned (0 leftover `@mavi-t1.test` users/groups/notifications); temp E2E script deleted; nothing committed (working tree left uncommitted for review)
- **T.2 Security/edge-case testing — DONE**
  - Dedicated security/edge-case HTTP suite executed as a live HTTP-only scenario against the running backend (`http://localhost:5000/api`) + MongoDB Atlas — **470/470 PASS**. The first run had 18 FAIL; every failure was traced to an incorrect script expectation — **no product bugs were found**: (1) G1 balance/net/outstanding arithmetic omitted the deliberately-created "forged-total probe" expense and a battery "injected participantShares on create" case that the app (correctly, per its strips-unknown-fields convention) *accepted* instead of 400, polluting G1; (2) a pre-accept admin invite attempt by a still-invited member → correct 403, which then made the "already-invited → 409" re-invite succeed (cascade); (3) a transfer-to-self case was issued by a now-demoted non-owner → correct 403; (4) the archived-group role-change probe ran after ownership transfer so the actor was no longer owner → 403 was correct, not an archived guard; (5) an "overlong email" used 225 chars which is under the schema `maxlength: 254` so it registered (201) — corrected to 305 chars → clean 400 via the ValidationError handler; (6) unauthenticated unknown-route returns **401** (the three `/api`-root routers apply global `authenticate` before `notFound`) and only an authenticated miss reaches the 404 handler — characterized: all three in `expense.routes.ts`/`balances.routes.ts`/`settlement.routes.ts` use router-level `router.use(authenticate)`; (7) per-user notification totals were re-derived from source (`notification.events.ts`) — actual per-user totals (with `cc` = accepted >2^53 bignum attempts): alice 17, bob 23+cc, carol 17+cc, eve 1, gina 2, luna 2, frank 3, una 26, dave 0, and validation battery/user-count expectations fixed to match. Corrected script re-ran **470/470 PASS** with verified 0-leftover cleanup
  - Key invariants verified live: sum(net)=0 and totalExpense/outstanding reconcile through settlement cancel/over-settlement/void/archive (G1 pre-void A +7500/B −4500/C −3000, total 44000, outstanding 7500; post-void A +9500/B −6500/C −3000, total 41000, outstanding 9500; G4 +250/−250 pre-archive and post-cancel; G5 666/−233/−433 → over-settlement flip C→A to A→C with edge −500 → restored on cancel), 6 split-method share distributions incl. largest remainder, pagination clamping (limit 0→20 clamp, page 0→1, negatives, NaN), notification recipient-exclusion policy, personal-expense isolation, `participantShares`/`split.totalMinor` injection being stripped (split remains authority) on both create and update, soft-void bookkeeping, archived-group financial 409s while cancel/history/invite remain, whole-flow 401/403/404 boundary checks
  - Security findings: **no genuine vulnerabilities or bugs found** across authentication, authorization/IDOR, input validation, money/data integrity, DB/resource safety, and config. Documented hardening/edge observations (deliberately NOT "fixed"): (a) unknown-route unauthenticated responses are 401 not 404 due to router-level auth middleware at the `/api` root — benign, arguably better (the authenticated miss correctly yields structured 404); (b) archived groups still allow invite/role/name/ownership-transfer member-management writes (no archived guard in `group.service.ts`) while financial writes are 409-blocked — product-consistency gap only, no money movement/cross-user exposure possible, frontend `MembersTab` shows the controls regardless; (c) CORS is `access-control-allow-origin: *` with bearer tokens only — acceptable for bearer-only auth, hardening opportunity when cookies are introduced; (d) no login rate-limit/account-lockout — hardening opportunity (MVP scope); (e) production 500s sanitize messages while non-production may leak internal messages (intentional, env-gated); (f) >2^53 `amountMinor` attempts never 500 — either 400 (float imprecision breaks the exact-total invariant, rejecting) or 201 with the leftover distributed deterministically; very large but safe integers are handled with exact integer math
  - Regression green on the same stack: notifications-smoke 51/51, settlements-smoke 48/48; backend self-tests splitting 65, balances 89, settlements 50, notifications 36; frontend `npm run build` (144 modules) + oxlint (0 errors; benign `set-state-in-effect` warnings only); backend `tsc` clean
  - Cleanup: 0 leftover `@mavi-t2.test`/`@mavi-smoke.test` users, groups, expenses, settlements, notifications; additionally purged pre-existing orphaned "H8 Smoke Group" artifacts (6 groups, 6 settlements, 102 notifications) and stale `@f1verify.test` campaign data (2 groups, 4 expenses, 8 notifications, 4 users) left by earlier crashed runs — real user data (Anil Verma personal expenses) was never touched; temp T.2 script deleted; nothing committed (working tree F.3–F.8 + T.1 + T.2 left uncommitted for review)
- **T.3 UI polish — DONE** (P0+P1 scope, audit-first)
  - Complete UI audit of the whole frontend (all pages, components, CSS, api/layers, lib) found the shared design system, spacing/typography scale, responsive breakpoints (row wrap, mobile drawer, form grids), loading/empty/error/retry states, and navigation already solid
  - Polished: (1) dashboard "Recent settlements" no longer leaks a raw truncated group id — shows the mapped group name (frontend-only via the already-loaded `DashboardData.groups`); (2) auth pages now use the danger design tokens instead of hardcoded light-mode reds, so invalid-field/banner error states match dark mode; (3) settlements filter active outline uses the accent token instead of a hardcoded blue fallback; (4) deleted dead Vite starter CSS (`App.css` unused file + `index.css` `#social`/`.counter`/`--code-bg`/`--social-bg`/global 56px `h1` boilerplate); (5) deleted the superseded "dashboard placeholder" block in `auth.css`; (6) `ExpensesTab` split badge uses a plain string class instead of an empty template literal
  - Verified: frontend `npm run build` (144 modules) + oxlint (0 errors, same benign `set-state-in-effect` baseline — deliberately untouched); backend untouched; live headless-Edge CDP sweep (fresh profile): `/login`, `/register`, `/dashboard` (settlement row shows "You paid a settlement · <group name>", no raw id), `/groups`, `/groups/:id` overview, `/expenses/personal`, `/notifications` all render with 0 JS console errors; seeded temp group/settlement E2E exercised the new name-mapping path on the real stack
  - Cleanup verified: 6 temp groups, 6 settlements, 18 notifications, 12 temp users removed; baseline restored (Anil Verma + "Kalsubai" only); temp verification/cleanup scripts and headless browser profile deleted; nothing committed (working tree F.3–F.8 + T.1 + T.2 + T.3 left uncommitted for review)
- **T.4 Production build — DONE**
  - Production frontend build: `npm run build` (`tsc -b` + `vite build`) clean — 144 modules, CSS 21.91 kB gz 4.48, JS 374.53 kB gz 113.06. Build verified twice: (a) default (dev fallback) and (b) with `VITE_API_URL` set — bundle then contained the configured URL and the `localhost:5000` fallback was eliminated (proves assets reference correct API config). `oxlint` 0 errors / the known 14 benign `set-state-in-effect` warnings (unchanged baseline)
  - Config fix: `frontend/src/services/api.ts` no longer hardcodes the API base URL — now `import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"`. For a deployed build, set `VITE_API_URL` at build time (documented in `AGENTS.md` and makes `.env.example`'s backend vars the only tracked env contract). No secrets in bundles: dist audited — the production bundle was checked and confirmed not to contain the test account email, test credentials/tokens, mongo URIs, or `JWT_SECRET` anywhere in generated assets
  - Production backend: `npm run build` (tsc) → 60 compiled `dist/*.js` incl. `dist/server.js`; started via `node dist/server.js` with `PORT=5100` (PORT proven env-driven) and `NODE_ENV=production`; `/api/health` → `{"success":true,"message":"MAVI API is healthy","database":"connected"}` (HTTP 200). Env contract verified in `src/config/env.ts`: `MONGODB_URI` required+validated, `PORT`, `NODE_ENV` ∈ dev/prod/test gating the error handler, `JWT_SECRET` min-16 validated, `JWT_EXPIRES_IN`. CORS default `*` with bearer-only tokens (previously documented, verified unchanged). Production error handling: malformed JSON → HTTP 500 `{"message":"Internal server error"}` (sanitized; stack logged server-side only, no request body/credentials in logs); request logger is method/URL/status/duration only
  - Live production sweep (headless-Edge/CDP against the production backend on :5100 + served production `dist` via `vite preview` with SPA history fallback): **8/8 PASS, 0 JS console errors** — public `/login` (login form, no app shell); full **UI registration → auth token → `/dashboard`** through the production backend (AuthContext + ProtectedRoute end-to-end); authenticated deep links `/dashboard`, `/groups`, `/groups/:id`, `/expenses/personal`, `/notifications` with stored-token full navigation (SPA fallback returns the shell from the server + API data loads through the configured base URL). In-browser API call to the configured `:5100/api` returned the seeded group. Backend untouched, dev servers on :5000/:5173 left running and unmodified
  - Regression green on the same stack: notifications-smoke 51/51, settlements-smoke 48/48; backend self-tests splitting 65, balances 89, settlements 50, notifications 36 (after fixing the smoke self-clean: `notifications-smoke.ts` created group `g1` but never added it to `cleanIds.groups`, so each successful run leaked one orphaned "H8 Smoke Group" + its notifications/settlement — one-line fix `cleanIds.groups.push(g1)`; re-ran PASS=51 FAIL=0 with verified 0 leftover)
  - Cleanup: temp users/groups/notifications removed plus the one pre-existing "H8 Smoke Group" orphan (1 group, 1 settlement, 17 notifications) purged after the fix was confirmed — baseline verified (Anil Verma + "Kalsubai" only); temp verification/cleanup scripts, seed files, and headless browser profile deleted; nothing committed (working tree F.3–F.8 + T.1 + T.2 + T.3 + T.4 left uncommitted for review)
- T.5 Deployment — NOT STARTED
- T.6 Documentation — NOT STARTED

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
- H.9 Reports — DONE

**Frontend:**

- F.1 App shell/navigation — DONE
- F.2 Real dashboard — DONE
- F.3 Groups — DONE
- F.4 Expenses + splitting interface — DONE
- F.5 Balances — DONE
- F.6 Settlements — DONE
- F.7 Notifications — DONE
- F.8 Personal expenses — DONE
- F.9 Reports + Export — DONE

**Final:**

- T.1 End-to-end testing — DONE
- T.2 Security/edge-case testing — DONE
- T.3 UI polish — DONE
- T.4 Production build — DONE
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

### F.8 — Personal Expenses UI (COMPLETE)

A dedicated Personal Expenses page at `/expenses/personal` (sidebar + mobile
nav) lets the authenticated user list, create, edit, and soft-delete their own
expenses via the H.5 personal-expense APIs — served through the shared expenses
API/service layer, with a create/edit form (title, INR amount, date) whose
validation mirrors the backend, ConfirmDialog-gated deletion, pagination,
loading/error/empty/success states, and list refresh after every mutation — all
verified 81/81 against the running backend plus regression smoke (51/51 +
48/48). Working tree (F.3 + F.4 + F.5 + F.6 + F.7 + F.8) uncommitted, pending
review.

**T.1 End-to-end testing — DONE**: integrated HTTP-only E2E suite **176/176
PASS** against the running backend + Atlas (auth, groups, all six split
methods, balances, settlements, notifications, personal expenses, dashboard,
DB data-integrity invariants, 0-leftover cleanup), all navigation routes serve
the SPA shell (200), regression smoke (51/51 + 48/48) and backend self-tests
(65/89/50/36) green, frontend build (144 modules) + oxlint and backend `tsc`
clean, temp script deleted, nothing committed. F.3–F.8 + T.1 remain
uncommitted for review.

**T.2 Security/edge-case testing — DONE**: live HTTP-only security/edge-case
suite **470/470 PASS** against the running backend + Atlas (authentication,
authorization/IDOR, input validation, money/data integrity, DB/resource
safety, security config). Every first-run FAIL (18) was an incorrect script
expectation — **no genuine vulnerabilities or product bugs found**; documented
hardening/edge observations only (unknown-route 401-from-router-level-auth,
archived groups still allow member-management writes, CORS `*` with bearer
tokens, no login rate-limit, production message sanitization, >2^53 robustness).
Regression green (notifications-smoke 51/51, settlements-smoke 48/48; self-tests
65/89/50/36; frontend build 144 modules + oxlint, backend `tsc` clean). Cleanup
verified 0 leftover test data (plus orphaned "H8 Smoke Group"/`@f1verify.test`
artifacts from earlier crashed runs purged; real user data untouched), temp
script deleted, nothing committed. F.3–F.8 + T.1 + T.2 remain uncommitted for
review.

**Next major step: T.5 — Deployment** (do not start without approval). No F.9 —
MAVI is feature-complete through F.8. T.4 (Production build) is complete — frontend
API base URL is env-configurable via `VITE_API_URL`, production backend verified
(`npm start` on `PORT`/`NODE_ENV=production`, sanitized errors, /api/health green),
and the served production build passed the live sweep (8/8, 0 console errors).
See the T.4 DONE note above.