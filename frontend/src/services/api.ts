import axios, { AxiosError } from 'axios';
import { ApiError, type FieldError } from '../types/api';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

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
  (error) => Promise.reject(toApiError(error)),
);
