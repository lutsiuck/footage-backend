import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { Authorization } from 'src/common/decorators/authorization.decorator';
import { CreateTeamDto } from './dtos/create-team.dto';
import { InvitePlayerDto } from './dtos/invite-player.dto';
import { TransferCaptainDto } from './dtos/transfer-captain.dto';
import type { AuthorizedRequest } from 'src/common/types/authorized-request.type';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadConfig } from 'src/common/config/image-upload.config';
import { UpdateTeamDto } from './dtos/update-team.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Authorization()
  @UseInterceptors(FileInterceptor('logo', imageUploadConfig('teams')))
  createTeam(
    @Body() dto: CreateTeamDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
            skipMagicNumbersValidation: true,
          }),
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5, message: 'Logo size must be less than 5MB' }), //5MB
        ],
      }),
    )
    logo: Express.Multer.File,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.createTeam(req.user.id, dto, logo);
  }

  @Patch(':id')
  @Authorization()
  @UseInterceptors(FileInterceptor('logo', imageUploadConfig('teams')))
  updateTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
            skipMagicNumbersValidation: true,
          }),
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5, message: 'Logo size must be less than 5MB' }), //5MB
        ],
        fileIsRequired: false,
      }),
    )
    logo: Express.Multer.File,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.updateTeam(id, req.user.id, dto, logo);
  }

  @Get()
  getTeams(
    @Query('nameTeam') name?: string,
    @Query('city') city?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.teamsService.getTeams({ name, city, limit, offset });
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

  @Get(':teamId/search-players')
  searchPlayer(@Param('teamId', ParseUUIDPipe) teamId: string, @Query('name') name?: string) {
    return this.teamsService.searchPlayers(teamId, name);
  }

  @Get(':teamId/invitations')
  getInvitations(@Param('teamId', ParseUUIDPipe) teamId: string) {
    return this.teamsService.getInvitations(teamId);
  }

  @Patch(':teamId/invitations/:tournamentId/approve')
  @Authorization()
  approveInvitation(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.approveInvitation(tournamentId, req.user.id, teamId);
  }

  @Patch(':teamId/invitations/:tournamentId/reject')
  @Authorization()
  rejectInvitation(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Req() req: AuthorizedRequest,
  ) {
    return this.teamsService.rejectInvitation(tournamentId, req.user.id, teamId);
  }
}
