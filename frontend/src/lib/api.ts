import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'sfb_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthCall && localStorage.getItem(TOKEN_KEY)) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

interface ApiErrorBody {
  message?: string;
  errors?: { path: string; message: string }[];
  details?: { path: string; message: string }[];
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Cannot reach the server. Check that the backend is running.';
    const body = err.response.data as ApiErrorBody | undefined;
    if (body?.errors?.length) return body.errors[0].message;
    return body?.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Field-level validation errors keyed by field path (from Zod on the backend). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!axios.isAxiosError(err)) return {};
  const body = err.response?.data as ApiErrorBody | undefined;
  const list = body?.errors ?? body?.details ?? [];
  const out: Record<string, string> = {};
  for (const e of list) if (e.path && !out[e.path]) out[e.path] = e.message;
  return out;
}

/** Fetches and unwraps response data, dropping empty params. */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const clean = params
    ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : undefined;
  const res = await api.get<T>(url, { params: clean });
  return res.data;
}
