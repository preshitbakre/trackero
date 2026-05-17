export class PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  toEnvelopeData() {
    return {
      list: this.data,
      hasNext: this.meta.page < this.meta.totalPages,
      hasPrev: this.meta.page > 1,
      pageNumber: this.meta.page,
      limit: this.meta.limit,
      total: this.meta.total,
    };
  }
}
