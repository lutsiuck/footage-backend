import {
  BadRequestException,
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
import { TournamentStatus, TournamentType } from '@prisma/client';
import { Authorization } from 'src/common/decorators/authorization.decorator';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dtos/create-tournament.dto';
import { TeamActionDto } from './dtos/team-action.dto';
import type { AuthorizedRequest } from 'src/common/types/authorized-request.type';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadConfig } from 'src/common/config/image-upload.config';
import { UpdateTournamentDto } from './dtos/update-tournament.dto';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post()
  @Authorization()
  @UseInterceptors(FileInterceptor('photo', imageUploadConfig('tournaments')))
  createTournament(
    @Body() dto: CreateTournamentDto,
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
    photo: Express.Multer.File,
    @Req() req: AuthorizedRequest,
  ) {
    return this.tournamentsService.createTournament(req.user!.id, dto, photo);
  }

  @Patch(':id')
  @Authorization()
  @UseInterceptors(FileInterceptor('photo', imageUploadConfig('tournaments')))
  updateTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTournamentDto,
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
    photo: Express.Multer.File,
    @Req() req: AuthorizedRequest,
  ) {
    return this.tournamentsService.updateTournament(req.user!.id, id, dto, photo);
  }

  @Get()
  getTournaments(
    @Query('nameTournament') name?: string,
    @Query('city') city?: string,
    @Query('types') types?: string,
    @Query('statuses') statuses?: string,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const typesQuery =
      (types
        ?.split(',')
        .map((type) => type.trim())
        .filter(Boolean) as TournamentType[]) || [];

    if (typesQuery?.some((value) => !Object.values(TournamentType).includes(value as TournamentType))) {
      throw new BadRequestException('Invalid tournament type');
    }

    const statusesQuery =
      (statuses
        ?.split(',')
        .map((status) => status.trim())
        .filter(Boolean) as TournamentStatus[]) || [];

    if (statusesQuery?.some((value) => !Object.values(TournamentStatus).includes(value as TournamentStatus))) {
      throw new BadRequestException('Invalid tournament status');
    }
    return this.tournamentsService.getTournaments({ name, city, types: typesQuery, statuses: statusesQuery, limit, offset });
  }

  @Get(':id')
  @Authorization()
  getTournamentDetails(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.getTournamentDetails(id, req.user?.id);
  }

  @Post(':id/apply')
  @Authorization()
  applyTeam(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TeamActionDto, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.applyTeam(id, req.user!.id, dto.team_id);
  }

  @Post(':id/invite')
  @Authorization()
  inviteTeam(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TeamActionDto, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.inviteTeam(id, req.user!.id, dto.team_id);
  }

  @Patch(':id/teams/:teamId/approve')
  @Authorization()
  approveTeam(@Param('id', ParseUUIDPipe) id: string, @Param('teamId', ParseUUIDPipe) teamId: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.approveTeam(id, req.user!.id, teamId);
  }

  @Patch(':id/teams/:teamId/reject')
  @Authorization()
  rejectTeam(@Param('id', ParseUUIDPipe) id: string, @Param('teamId', ParseUUIDPipe) teamId: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.rejectTeam(id, req.user!.id, teamId);
  }

  @Delete(':id/teams/:teamId')
  @Authorization()
  removeTeam(@Param('id', ParseUUIDPipe) id: string, @Param('teamId', ParseUUIDPipe) teamId: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.removeTeam(id, req.user!.id, teamId);
  }

  @Patch(':id/start')
  @Authorization()
  startTournament(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.startTournament(id, req.user!.id);
  }

  @Patch(':id/finish')
  @Authorization()
  finishTournament(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.tournamentsService.finishTournament(id, req.user!.id);
  }
}
