# AGENTS.md

MERN monorepo: `frontend/` (React 19 + Vite) and `backend/` (Express 5 + Mongoose). No npm workspaces — the two are independent apps with their own `package.json`/`package-lock.json` and no root scripts. Run every command from the app subdirectory. There are no tests and no CI.

## Backend (`backend/`)

- Stack: Express 5, Mongoose 9, JWT, TypeScript (ESM). Entry: `src/server.ts`.
- Commands: `npm run dev` (tsx watch), `npm run build` (tsc), `npm start` (node dist/server.js). No lint/test scripts; `npm run build` is the typecheck.
- Requires `backend/.env` (copy `.env.example`); `MONGODB_URI` is mandatory and the process exits if the DB connection fails.
- `"type": "module"` + NodeNext: relative imports must use explicit `.js` extensions, e.g. `import { x } from "./config/database.js"`.
- `src/middleware`, `src/modules`, `src/routes`, `src/utils` are empty placeholders — API is currently just the `/api/health` route. Health endpoint is at `/api/health` (server.ts:13).

## Frontend (`frontend/`)

- Commands: `npm run dev` (vite), `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint, NOT eslint), `npm run preview`.
- `tsconfig.app.json` enforces `verbatimModuleSyntax` (use `import type` for types) and `erasableSyntaxOnly` (no TS enums/namespaces — use union types / const objects). Note: `strict` is NOT enabled.
- `src/services/api.ts` resolves the backend base URL from `import.meta.env.VITE_API_URL`, defaulting to `http://localhost:5000/api`; run the backend on port 5000 for the dev setup to work, or set `VITE_API_URL` at build time to override for a deployed environment.