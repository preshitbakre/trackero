import { PaginatedResponse } from './paginated-response.dto';

export class PaginatedMutationResponse<T> {
  constructor(
    public readonly item: T | null,
    public readonly paginatedList: PaginatedResponse<T>,
  ) {}

  static forPaginated<T>(item: T | null, list: PaginatedResponse<T>) {
    return new PaginatedMutationResponse(item, list);
  }

  static fromFullList<T>(item: T | null, list: T[]) {
    const paginatedList = new PaginatedResponse(list, list.length, 1, list.length || 1);
    return new PaginatedMutationResponse(item, paginatedList);
  }

  toEnvelopeData() {
    return {
      item: this.item,
      ...this.paginatedList.toEnvelopeData(),
    };
  }
}
