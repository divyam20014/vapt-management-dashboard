import axios, { AxiosError } from 'axios';
import { ApiError, type FieldError } from '../types/api';

/**
 * The session is an HttpOnly cookie set by the server, so scripts never see it. The server requires
 * `X-Requested-With` on every request that changes data (CSRF defence); axios sends it on all requests.
 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
});

/** Called when the server says the session is missing or has ended (set by AuthProvider). */
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

function toFieldErrors(details: unknown): FieldError[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (item): item is FieldError => typeof item?.field === 'string' && typeof item?.message === 'string',
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new ApiError('Unable to reach the server. Check that the backend is running.', null, 'network_error');
    }
    const envelope = (error.response.data ?? {}) as ErrorEnvelope;
    return new ApiError(
      envelope.error?.message ?? `Request failed with status ${error.response.status}.`,
      error.response.status,
      envelope.error?.code ?? 'http_error',
      toFieldErrors(envelope.error?.details),
      envelope.error?.details ?? null,
    );
  }
  return new ApiError('An unexpected error occurred.', null, 'unknown_error');
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    if (apiError.status === 401 && apiError.code === 'not_authenticated') unauthorizedHandler?.();
    return Promise.reject(apiError);
  },
);
