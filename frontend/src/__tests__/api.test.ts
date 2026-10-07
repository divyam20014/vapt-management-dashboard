import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { toApiError } from '../services/api';

function responseError(status: number, data: unknown) {
  const response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response);
}

describe('toApiError', () => {
  it('reads the backend error envelope', () => {
    const error = toApiError(
      responseError(422, {
        error: { code: 'validation_error', message: 'The request contains invalid data.', details: [{ field: 'name', message: 'Required' }] },
      }),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_error');
    expect(error.message).toBe('The request contains invalid data.');
    expect(error.fieldErrors).toEqual([{ field: 'name', message: 'Required' }]);
  });

  it('handles network failures', () => {
    const error = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(error.code).toBe('network_error');
    expect(error.status).toBeNull();
  });

  it('falls back when the response has no envelope', () => {
    const error = toApiError(responseError(502, '<html>Bad gateway</html>'));
    expect(error.message).toBe('Request failed with status 502.');
  });
});
