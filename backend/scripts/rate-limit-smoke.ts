/**
 * API rate-limiting tests — spins up ephemeral Express apps (no DB, no email,
 * no test data). Verifies limits, 429 envelope, health availability,
 * per-endpoint budgets, reverse-proxy IP handling, and that spoofed
 * X-Forwarded-For headers cannot rotate buckets when trust proxy is off.
 *
 *   npx tsx scripts/rate-limit-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { createApp, type CreateAppOptions } from "../src/app.js";

const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";

let failures = 0;
const failuresList: string[] = [];
const passCount = { n: 0 };

const check = (condition: boolean, label: string): void => {
  if (condition) {
    passCount.n++;
  } else {
    failures++;
    failuresList.push(`FAIL: ${label}`);
  }
};

interface TestServer {
  base: string;
  close: () => Promise<void>;
}

async function startApp(options: CreateAppOptions = {}): Promise<TestServer> {
  const app = createApp(options);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;
  return {
    base,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}

async function request(
  base: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.method !== "GET" && init.method !== undefined && init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.method !== "GET" && init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function collectStatuses(
  base: string,
  requests: Array<{ path: string; state?: { headers?: Record<string, string> } }>,
): Promise<number[]> {
  const statuses: number[] = [];
  for (const r of requests) {
    const res = await request(base, r.path, { headers: r.state?.headers });
    statuses.push(res.status);
  }
  return statuses;
}

async function expect429Envelope(res: Response, label: string): Promise<void> {
  check(res.status === 429, `${label}: status is 429 (got ${res.status})`);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  check(body !== null, `${label}: body is JSON`);
  check(body?.success === false, `${label}: body.success === false`);
  check(typeof body?.message === "string" && (body.message as string).length > 0, `${label}: body.message is a non-empty string`);
  check(
    JSON.stringify(Object.keys(body ?? {}).sort()) === JSON.stringify(["message", "success"]),
    `${label}: response has only MAVI { success, message } keys`,
  );
  const serialized = JSON.stringify(body);
  check(
    !/password|jwt|token|secret|\.env|mongo|stack|at\s/.test(serialized.toLowerCase()),
    `${label}: no sensitive/internal data in 429 body`,
  );
  check((body?.message as string) === RATE_LIMIT_MESSAGE, `${label}: safe generic message`);
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: health endpoint stays available (repeated hits, default app)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, logging: false });
    const ok = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(srv.base, "/health");
      ok.push(res.status);
      if (i === 0) {
        const body = await res.json().catch(() => null);
        check(body?.success === true, "TEST 1: health body success === true");
      }
    }
    check(ok.every((s) => s === 200), `TEST 1: health always 200 (got ${ok.join(",")})`);
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: normal requests succeed below the limits (default app)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, logging: false });
    const loginStatuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      loginStatuses.push((await request(srv.base, "/auth/login", { method: "POST", body: {} })).status);
    }
    check(
      loginStatuses.every((s) => s === 400),
      `TEST 2: login allowed below limit (got ${loginStatuses.join(",")})`,
    );
    const me = await request(srv.base, "/auth/me");
    check(me.status === 401, "TEST 2: /auth/me returns 401 without token (not limited)");
    const groups = await request(srv.base, "/groups");
    check(groups.status === 401, "TEST 2: /groups returns 401 without token (not limited)");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: login limiter triggers 429 with MAVI envelope + headers
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { authLoginMax: 3 }, logging: false });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await request(srv.base, "/auth/login", { method: "POST", body: {} })).status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([400, 400, 400, 429]),
      `TEST 3: login limiter statuses (got ${statuses.join(",")})`,
    );
    const blocked = await request(srv.base, "/auth/login", { method: "POST", body: {} });
    await expect429Envelope(blocked, "TEST 3");
    const h = blocked.headers;
    check(h.get("ratelimit-limit") !== null, "TEST 3: standard RateLimit-Limit header present");
    check(h.get("ratelimit-remaining") === "0", "TEST 3: RateLimit-Remaining is 0");
    check(h.get("x-ratelimit-remaining") === "0", "TEST 3: legacy X-RateLimit-Remaining is 0");
    check((Number(h.get("retry-after")) || 0) > 0, "TEST 3: Retry-After header present");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: register limiter triggers 429
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { authRegisterMax: 2 }, logging: false });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(srv.base, "/auth/register", { method: "POST", body: {} })).status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([400, 400, 429]),
      `TEST 4: register limiter statuses (got ${statuses.join(",")})`,
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: verify-email limiter triggers 429
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { authVerifyEmailMax: 2 }, logging: false });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(srv.base, "/auth/verify-email")).status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([400, 400, 429]),
      `TEST 5: verify-email limiter statuses (got ${statuses.join(",")})`,
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5b: forgot-password limiter triggers 429
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { authForgotPasswordMax: 2 }, logging: false });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(srv.base, "/auth/forgot-password", { method: "POST", body: {} })).status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([400, 400, 429]),
      `TEST 5b: forgot-password limiter statuses (got ${statuses.join(",")})`,
    );
    const blocked = await request(srv.base, "/auth/forgot-password", { method: "POST", body: {} });
    await expect429Envelope(blocked, "TEST 5b");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5c: reset-password limiter triggers 429
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { authResetPasswordMax: 2 }, logging: false });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(srv.base, "/auth/reset-password", { method: "POST", body: {} })).status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([400, 400, 429]),
      `TEST 5c: reset-password limiter statuses (got ${statuses.join(",")})`,
    );
    const blocked = await request(srv.base, "/auth/reset-password", { method: "POST", body: {} });
    await expect429Envelope(blocked, "TEST 5c");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: general API limiter triggers 429; health + auth stay unaffected
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { generalApiMax: 3 }, logging: false });
    const groupsStatuses = await collectStatuses(srv.base, [
      { path: "/groups", state: {} },
      { path: "/groups", state: {} },
      { path: "/groups", state: {} },
      { path: "/groups", state: {} },
    ]);
    check(
      JSON.stringify(groupsStatuses) === JSON.stringify([401, 401, 401, 429]),
      `TEST 6: general limiter statuses (got ${groupsStatuses.join(",")})`,
    );
    const healthAfter = await request(srv.base, "/health");
    check(healthAfter.status === 200, "TEST 6: health still 200 after general quota exhausted");
    const loginAfter = await request(srv.base, "/auth/login", { method: "POST", body: {} });
    check(loginAfter.status === 400, "TEST 6: auth endpoint unaffected by general bucket (got login status " + loginAfter.status + ")");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: reverse-proxy aware — one forwarded IP is limited as one bucket
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 1, rateLimits: { generalApiMax: 3 }, logging: false });
    const statuses = await collectStatuses(srv.base, [0, 1, 2, 3].map(() => ({
      path: "/groups",
      state: { headers: { "X-Forwarded-For": "203.0.113.1" } },
    })));
    check(
      JSON.stringify(statuses) === JSON.stringify([401, 401, 401, 429]),
      `TEST 7: single forwarded IP limited (got ${statuses.join(",")})`,
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: reverse-proxy aware — distinct forwarded IPs get separate budgets
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 1, rateLimits: { generalApiMax: 3 }, logging: false });
    const ips = ["203.0.113.10", "203.0.113.11"];
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(srv.base, "/groups", {
        headers: { "X-Forwarded-For": ips[i % 2] },
      });
      statuses.push(res.status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([401, 401, 401, 401, 401, 401, 429]),
      `TEST 8: distinct IPs keep separate buckets (got ${statuses.join(",")})`,
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: trust proxy OFF — spoofed X-Forwarded-For cannot rotate buckets
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 0, rateLimits: { generalApiMax: 3 }, logging: false });
    const ips = ["203.0.113.50", "203.0.113.51"];
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(srv.base, "/groups", {
        headers: { "X-Forwarded-For": ips[i % 2] },
      });
      statuses.push(res.status);
    }
    check(
      JSON.stringify(statuses) === JSON.stringify([401, 401, 401, 429]),
      `TEST 9: spoofed XFF ignored without trust proxy (got ${statuses.join(",")})`,
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\nchecks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL RATE-LIMIT SMOKE TESTS FAILED");
  } else {
    console.log("\nALL RATE-LIMIT SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Rate-limit smoke crashed:", err);
  process.exit(2);
});