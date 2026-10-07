export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Normalised error thrown by the service layer for every failed API call. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(message: string, status: number | null, code: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
