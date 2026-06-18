const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type Session = {
  token: string;
  refresh_token?: string;
  user: { id: string; userId?: string; tenantId?: string; name: string; email: string; role?: "admin" | "agent" };
};

export async function request<T>(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<T> {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retryOnUnauthorized && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, false);
    clearSessionAndRedirect();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erro na requisicao" }));
    throw new Error(payload.error ?? "Erro na requisicao");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function register(email: string, password: string, tenantName: string, name?: string) {
  return request<Session>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, tenantName, name: name || undefined })
  });
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) return false;
    const session = (await response.json()) as Session;
    localStorage.setItem("token", session.token);
    if (session.refresh_token) localStorage.setItem("refresh_token", session.refresh_token);
    return true;
  } catch {
    return false;
  }
}

function clearSessionAndRedirect() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/";
}
