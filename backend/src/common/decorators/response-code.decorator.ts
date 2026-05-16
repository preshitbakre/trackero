import { SetMetadata } from '@nestjs/common';
import { ResponseCodeKey } from '../constants/response-codes';

export const RESPONSE_CODE_KEY = 'response_code';
export const ResponseCode = (key: ResponseCodeKey) =>
  SetMetadata(RESPONSE_CODE_KEY, key);
