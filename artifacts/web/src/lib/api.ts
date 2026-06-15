const API_BASE = "/api";
let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) h["Authorization"] = `Bearer ${_token}`;
  return h;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  plan: string;
}

export const authApi = {
  me: async (): Promise<User> => {
    const r = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
      credentials: "include",
    });
    if (!r.ok) throw new Error("Unauthorized");
    return r.json();
  },
  logout: async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
    });
  },
};

export const api = {
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data as any).error ?? "Request failed");
    return data as T;
  },
};
