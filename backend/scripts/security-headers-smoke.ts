/**
 * Security-header (Helmet) tests — spins up ephemeral Express apps (no DB, no
 * email, no test data) and inspects ACTUAL response headers. Verifies:
 *
 *   - standard security headers on API responses (nosniff, frame protection,
 *     referrer policy, CSP, COOP/CORP, agent-cluster, Permissions-Policy, ...)
 *   - HSTS present in production-HTTPS (trusted proxy) config but NOT sent on
 *     local HTTP development
 *   - existing CORS + rate limiting + health/404/error responses still work and
 *     all carry the security headers
 *   - no sensitive information leaks in headers or bodies, X-Powered-By removed
 *
 *   npx tsx scripts/security-headers-smoke.ts
 */
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { createApp, type CreateAppOptions } from "../src/app.js";

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

const hasHeader = (res: Response, name: string): [boolean, string | null] => {
  const value = res.headers.get(name);
  return [value !== null, value];
};

/**
 * Asserts the full security-header baseline on a response. Every expected value
 * is checked against the ACTUAL header output of the running app.
 */
const expectSecurityHeaders = (res: Response, label: string): void => {
  const checkHeaderValue = (name: string, expected: string, exact = false): void => {
    const value = res.headers.get(name);
    const present = exact ? value === expected : value !== null && value!.includes(expected);
    check(present, `${label}: ${name} = expected "${expected}" (got: ${value ?? "<missing>"})`);
  };
  const checkHeaderPresent = (name: string): void => {
    const [present, value] = hasHeader(res, name);
    check(present, `${label}: ${name} header present (got: ${value ?? "<missing>"})`);
  };

  checkHeaderValue("x-content-type-options", "nosniff", true);
  checkHeaderValue("x-frame-options", "DENY", true);
  checkHeaderValue("referrer-policy", "no-referrer", true);
  checkHeaderPresent("content-security-policy");
  checkHeaderPresent("permissions-policy");
  checkHeaderPresent("cross-origin-opener-policy");
  checkHeaderPresent("cross-origin-resource-policy");
  checkHeaderPresent("origin-agent-cluster");
  checkHeaderValue("x-dns-prefetch-control", "off", true);
  checkHeaderValue("x-download-options", "noopen", true);
  checkHeaderValue("x-permitted-cross-domain-policies", "none", true);
  checkHeaderValue("x-xss-protection", "0", true);
  checkHeaderValue("cross-origin-opener-policy", "same-origin", false);
  checkHeaderValue("cross-origin-resource-policy", "same-origin", false);
  checkHeaderValue("content-security-policy", "default-src 'none'");
  checkHeaderValue("content-security-policy", "frame-ancestors 'none'");
  checkHeaderValue("permissions-policy", "camera=()");
  checkHeaderValue("permissions-policy", "geolocation=()");
  checkHeaderValue("permissions-policy", "microphone=()");
  check(!res.headers.has("x-powered-by"), `${label}: X-Powered-By is removed`);
};

interface TestServer {
  port: number;
  origin: string;
  base: string;
  close: () => Promise<void>;
}

async function startApp(options: CreateAppOptions = {}): Promise<TestServer> {
  const app = createApp(options);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    base: `http://127.0.0.1:${port}/api`,
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

async function main(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: default (development/localhost) app — health stays 200 and every
  // API response carries the full security-header baseline.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const res = await request(srv.base, "/health");
    check(res.status === 200, `TEST 1: health endpoint is 200 (got ${res.status})`);
    const body = await res.json().catch(() => null);
    check(body?.success === true, "TEST 1: health body success === true");
    expectSecurityHeaders(res, "TEST 1");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: HSTS is NOT sent over local HTTP development (no trust proxy).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const res = await request(srv.base, "/health");
    check(
      !res.headers.has("strict-transport-security"),
      "TEST 2: no Strict-Transport-Security over HTTP (dev) — HSTS not forced on localhost",
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: HSTS IS present for HTTPS in the production (trusted proxy) config,
  // with the intended max-age and no includeSubDomains/preload.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 1, logging: false });
    const res = await request(srv.base, "/health", {
      headers: { "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.100" },
    });
    const hsts = res.headers.get("strict-transport-security");
    check(res.status === 200, `TEST 3: proxied HTTPS health is 200 (got ${res.status})`);
    check(hsts !== null && hsts.includes("max-age=31536000"), `TEST 3: HSTS max-age=31536000 (got: ${hsts ?? "<missing>"})`);
    check(hsts !== null && !hsts.includes("includeSubDomains"), `TEST 3: HSTS has no includeSubDomains (got: ${hsts ?? "<missing>"})`);
    check(hsts !== null && !hsts.includes("preload"), `TEST 3: HSTS has no preload (got: ${hsts ?? "<missing>"})`);
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: even behind a trusted proxy, a plain-HTTP request does not get HSTS.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ trustProxyHops: 1, logging: false });
    const res = await request(srv.base, "/health", {
      headers: { "X-Forwarded-For": "203.0.113.101" },
    });
    check(
      !res.headers.has("strict-transport-security"),
      "TEST 4: no Strict-Transport-Security when the proxied request is plain HTTP",
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: existing CORS behavior still works — GET with an Origin gets ACAO,
  // and the preflight OPTIONS is still answer  with allowed methods.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const origin = "https://mavi.vercel.app";
    const get = await request(srv.base, "/health", { headers: { Origin: origin } });
    check(get.headers.get("access-control-allow-origin") === "*", "TEST 5: CORS GET returns Access-Control-Allow-Origin: *");

    const preflight = await request(srv.base, "/auth/login", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    check(preflight.status === 204, `TEST 5: CORS preflight returns 204 (got ${preflight.status})`);
    check(preflight.headers.get("access-control-allow-origin") === "*", "TEST 5: preflight returns Access-Control-Allow-Origin: *");
    const acam = preflight.headers.get("access-control-allow-methods") ?? "";
    check(acam.includes("POST"), `TEST 5: preflight exposes allowed methods (got: ${acam})`);
    expectSecurityHeaders(preflight, "TEST 5 (preflight)");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: security headers are present on a 404 error response, and the body
  // leaks no internals. (Unknown routes under /api are caught by the auth
  // guard first — 401 — so the 404 is exercised at the app level where
  // notFound/errorHandler produce the same response shape.)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const res = await request(srv.origin, "/no-such-route");
    check(res.status === 404, `TEST 6: unknown route is 404 (got ${res.status})`);
    expectSecurityHeaders(res, "TEST 6");
    const raw = await res.text();
    check(raw.includes("Route not found"), 'TEST 6: 404 body carries generic "Route not found"');
    check(!/stack|Error:|\.env|mongo|at\s/.test(raw), "TEST 6: no internals in 404 body");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: security headers are present on a rate-limited (429) response.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false, rateLimits: { authLoginMax: 1 } });
    const first = await request(srv.base, "/auth/login", { method: "POST", body: {} });
    check(first.status === 400, `TEST 7: first login allowed (got ${first.status})`);
    const res = await request(srv.base, "/auth/login", { method: "POST", body: {} });
    check(res.status === 429, `TEST 7: second login is rate-limited (got ${res.status})`);
    expectSecurityHeaders(res, "TEST 7");
    const body = await res.json().catch(() => null);
    check(
      JSON.stringify(body) === JSON.stringify({
        success: false,
        message: "Too many requests. Please try again later.",
      }),
      "TEST 7: rate-limit envelope unchanged",
    );
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: security headers are present on an auth error (401) response.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const res = await request(srv.base, "/auth/me");
    check(res.status === 401, `TEST 8: unauthorized /auth/me (got ${res.status})`);
    expectSecurityHeaders(res, "TEST 8");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: all security headers survive a POST request with a body (JSON parse
  // path), so the ordering with express.json() is intact.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const srv = await startApp({ logging: false });
    const res = await request(srv.base, "/auth/register", { method: "POST", body: {} });
    check(res.status === 400, `TEST 9: register validation error (got ${res.status})`);
    expectSecurityHeaders(res, "TEST 9");
    const raw = await res.text();
    check(!/password|secret|stack/i.test(raw), "TEST 9: no sensitive data in validation error body");
    await srv.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\nsecurity-header checks passed: ${passCount.n}`);
  if (failures > 0) {
    console.log(`\nFAILURES (${failures}):\n- ${failuresList.join("\n- ")}\n`);
    console.log("ALL SECURITY-HEADER SMOKE TESTS FAILED");
  } else {
    console.log("\nALL SECURITY-HEADER SMOKE TESTS PASSED");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Security-header smoke crashed:", err);
  process.exit(2);
});