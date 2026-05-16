export interface ApiSuccessResponse<T> {
  success: true;
  code: string;
  data: T;
  message: string;
  errors: null;
  validationErrors: null;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  data: null;
  message: string;
  errors: Array<{ code: string; message: string }>;
  validationErrors: Array<{ error: string; message: string }> | null;
}

export interface PaginatedData<T> {
  list: T[];
  hasNext: boolean;
  hasPrev: boolean;
  pageNumber: number;
  limit: number;
  total: number;
}

export interface MutationData<T> extends PaginatedData<T> {
  item: T | null;
}
