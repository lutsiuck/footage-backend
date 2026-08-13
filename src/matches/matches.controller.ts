import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Authorization } from 'src/common/decorators/authorization.decorator';
import type { AuthorizedRequest } from 'src/common/types/authorized-request.type';
import { CreateMatchDto } from './dtos/create-match.dto';
import { CreateMatchEventDto } from './dtos/create-match-event.dto';
import { UpdateScoreDto } from './dtos/update-score.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @Authorization()
  createMatch(@Body() dto: CreateMatchDto, @Req() req: AuthorizedRequest) {
    return this.matchesService.createMatch(req.user.id, dto);
  }

  @Get()
  getMatches(
    @Query('tournament_id') tournament_id?: string,
    @Query('team_id') team_id?: string,
    @Query('date') date?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.matchesService.getMatches({ tournament_id, team_id, date, limit, offset });
  }

  @Get(':id')
  getMatchDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.matchesService.getMatchDetails(id);
  }

  @Get(':id/videos')
  getMatchVideos(@Param('id', ParseUUIDPipe) id: string) {
    return this.matchesService.getMatchVideos(id);
  }

  @Patch(':id/score')
  @Authorization()
  updateScore(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScoreDto, @Req() req: AuthorizedRequest) {
    return this.matchesService.updateScore(id, req.user.id, dto);
  }

  @Patch(':id/finish')
  @Authorization()
  finishMatch(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.matchesService.finishMatch(id, req.user.id);
  }

  @Post(':id/events')
  @Authorization()
  addEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMatchEventDto, @Req() req: AuthorizedRequest) {
    return this.matchesService.addEvent(id, req.user.id, dto);
  }

  @Delete(':id/events/:eventId')
  @Authorization()
  deleteEvent(@Param('id', ParseUUIDPipe) id: string, @Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: AuthorizedRequest) {
    return this.matchesService.deleteEvent(id, eventId, req.user.id);
  }
}
