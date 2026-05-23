import { Controller, Get, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Phase 4 — sectioned response is the default. `?v=1` returns the legacy
  // `{ list, total }` shape for one release of back-compat.
  @Get()
  @ResponseCode('SEARCH_RESULTS')
  async search(
    @Query('q') query: string,
    @Query('projectId', new ParseIntPipe({ optional: true })) projectId: number | undefined,
    @Query('scope') scope: string | undefined,
    @Query('v') version: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (version === '1') {
      return this.searchService.searchLegacy(query, user.userId, user.role, projectId);
    }
    const normalisedScope: 'current' | 'instance' = scope === 'instance' ? 'instance' : 'current';
    return this.searchService.search(query, user.userId, user.role, projectId, normalisedScope);
  }
}
