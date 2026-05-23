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

  @Get()
  @ResponseCode('SEARCH_RESULTS')
  async search(
    @Query('q') query: string,
    @Query('projectId', new ParseIntPipe({ optional: true })) projectId?: number,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.searchService.search(query, user!.userId, user!.role, projectId);
  }
}
