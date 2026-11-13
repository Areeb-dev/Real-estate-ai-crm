/**
 * Resolve API base URL at call time (browser).
 * On Heroku (single dyno), use same-origin so a baked-in localhost from
 * NEXT_PUBLIC_API_URL at build time cannot break production.
 */
export function getApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) {
        return fromEnv.replace(/\/$/, "");
      }
      return ""; // same origin — /api/... on this Heroku app
    }
    return (fromEnv || "http://localhost:4000").replace(/\/$/, "");
  }

  return (fromEnv || process.env.API_URL || "http://localhost:4000").replace(
    /\/$/,
    ""
  );
}

/** @deprecated Prefer getApiUrl() — kept for existing imports */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL !== undefined
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:4000";

export type ApiResult<T> = { success: boolean; data: T; message?: string };

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json.data as T;
}
