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
import { TeamsService } from './teams.service';
import { Authorization } from 'src/common/decorators/authorization.decorator';
import { CreateTeamDto } from './dtos/create-team.dto';
import { InvitePlayerDto } from './dtos/invite-player.dto';
import { TransferCaptainDto } from './dtos/transfer-captain.dto';
import type { AuthorizedRequest } from 'src/common/types/authorized-request.type';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Authorization()
  createTeam(@Body() dto: CreateTeamDto, @Req() req: AuthorizedRequest) {
    return this.teamsService.createTeam(req.user.id, dto);
  }

  @Get()
  getTeams(
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.teamsService.getTeams({ search, city, limit, offset });
  }

  @Get(':id')
  getTeamDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamsService.getTeamDetails(id);
  }

  @Post(':id/join')
  @Authorization()
  joinTeam(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.teamsService.joinTeam(id, req.user.id);
  }

  @Post(':id/invite')
  @Authorization()
  invitePlayer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvitePlayerDto, @Req() req: AuthorizedRequest) {
    return this.teamsService.invitePlayer(id, req.user.id, dto.user_id);
  }

  @Patch(':teamId/members/:userId/approve')
  @Authorization()
  approveMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.approveMember(teamId, req.user.id, userId);
  }

  @Patch(':teamId/members/:userId/reject')
  @Authorization()
  rejectMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.rejectMember(teamId, req.user.id, userId);
  }

  @Delete(':teamId/members/:userId')
  @Authorization()
  removeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.removeMember(teamId, req.user.id, userId);
  }

  @Patch(':teamId/transfer')
  @Authorization()
  transferCaptain(@Param('teamId', ParseUUIDPipe) teamId: string, @Body() dto: TransferCaptainDto, @Req() req: AuthorizedRequest) {
    return this.teamsService.transferCaptain(teamId, req.user.id, dto.new_captain_id);
  }
}
