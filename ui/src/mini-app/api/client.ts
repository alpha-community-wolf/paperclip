import type { MiniAppAuthResponse } from "@paperclipai/shared";

const BASE = "/api";

let authToken: string | null = null;

class MiniAppApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "MiniAppApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new MiniAppApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }

  return res.json();
}

async function postFormRequest<T>(path: string, body: FormData): Promise<T> {
  const headers = new Headers();
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new MiniAppApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }

  return res.json();
}

export const miniAppApi = {
  setToken(token: string) {
    authToken = token;
  },

  getToken() {
    return authToken;
  },

  auth(initData: string, botId: string) {
    return request<MiniAppAuthResponse>("/telegram/mini-app/auth", {
      method: "POST",
      body: JSON.stringify({ initData, botId }),
    });
  },

  get: <T>(path: string) => request<T>(path),
  postForm: <T>(path: string, body: FormData) => postFormRequest<T>(path, body),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
