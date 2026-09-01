import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, TeamMemberRole, TournamentStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTournamentDto } from './dtos/create-tournament.dto';
import type { TournamentsQuery } from './types/tournaments-query.type';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTournament(userId: string, dto: CreateTournamentDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Tournament name is required');
    const startDate = dto.start_date ? new Date(dto.start_date) : undefined;
    const endDate = dto.end_date ? new Date(dto.end_date) : undefined;
    if (startDate && Number.isNaN(startDate.getTime())) throw new BadRequestException('start_date must be a valid date');
    if (endDate && Number.isNaN(endDate.getTime())) throw new BadRequestException('end_date must be a valid date');
    if (startDate && endDate && endDate < startDate) throw new BadRequestException('end_date must be >= start_date');

    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: dto.name.trim(),
          type: dto.type,
          city: dto.city?.trim(),
          start_date: startDate,
          end_date: endDate,
          created_by: userId,
          status: TournamentStatus.draft,
        },
      });
      await tx.user.updateMany({ where: { id: userId, is_organizer: false }, data: { is_organizer: true } });
      return tournament;
    });
  }

  async getTournaments(query: TournamentsQuery) {
    const { name, city, types, statuses, limit = 15, offset = 0 } = query;
    const where = {
      ...(name?.trim() ? { name: { contains: name.trim(), mode: 'insensitive' as const } } : {}),
      ...(city?.trim() ? { city: { equals: city.trim(), mode: 'insensitive' as const } } : {}),
      ...(types?.length ? { type: { in: types } } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({ where, orderBy: { id: 'desc' }, skip: offset, take: limit }),
      this.prisma.tournament.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async getTournamentDetails(tournamentId: string, userId?: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    const isOrganizer = userId ? await this.isTournamentOrganizer(userId, tournamentId) : false;

    const teams = await this.prisma.tournamentTeam.findMany({
      where: {
        tournament_id: tournamentId,
        status: isOrganizer
          ? { in: [MembershipStatus.approved, MembershipStatus.invited, MembershipStatus.requested] }
          : MembershipStatus.approved,
      },
      include: { team: { select: { id: true, name: true, logo_url: true } } },
    });

    return {
      ...tournament,
      teams: teams.map((item) => ({ id: item.team.id, name: item.team.name, logo: item.team.logo_url, status: item.status })),
    };
  }

  async applyTeam(tournamentId: string, userId: string, teamId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    if (tournament.status !== TournamentStatus.draft) throw new ConflictException('Cannot apply to non-draft tournament');
    await this.ensureTeamExists(teamId);
    if (!(await this.isTeamCaptain(userId, teamId))) throw new ForbiddenException('Only team captain can apply');
    await this.ensureTeamNotInTournament(tournamentId, teamId);

    const tournamentTeam = await this.prisma.tournamentTeam.create({
      data: { tournament_id: tournamentId, team_id: teamId, status: MembershipStatus.requested },
    });
    return { success: true, tournament_team: tournamentTeam };
  }

  async inviteTeam(tournamentId: string, userId: string, teamId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status !== TournamentStatus.draft) throw new ConflictException('Cannot invite to non-draft tournament');
    await this.ensureTeamExists(teamId);
    await this.ensureTeamNotInTournament(tournamentId, teamId);

    const tournamentTeam = await this.prisma.tournamentTeam.create({
      data: { tournament_id: tournamentId, team_id: teamId, status: MembershipStatus.invited },
    });
    return { success: true, tournament_team: tournamentTeam };
  }

  async approveTeam(tournamentId: string, userId: string, teamId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status !== TournamentStatus.draft) throw new ConflictException('Cannot approve in non-draft tournament');

    const item = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
    });
    if (!item) throw new NotFoundException('Team application not found');

    const updated = await this.prisma.tournamentTeam.update({ where: { id: item.id }, data: { status: MembershipStatus.approved } });
    return { success: true, tournament_team: updated };
  }

  async rejectTeam(tournamentId: string, userId: string, teamId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status !== TournamentStatus.draft) throw new ConflictException('Cannot reject in non-draft tournament');

    const item = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
    });
    if (!item) throw new NotFoundException('Team application not found');

    await this.prisma.tournamentTeam.delete({ where: { id: item.id } });
    return { success: true };
  }

  async removeTeam(tournamentId: string, userId: string, teamId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status === TournamentStatus.active) throw new ConflictException('Cannot remove team from active tournament');

    const item = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
    });
    if (!item) throw new NotFoundException('Tournament team not found');

    await this.prisma.tournamentTeam.delete({ where: { id: item.id } });
    return { success: true };
  }

  async startTournament(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status !== TournamentStatus.draft) throw new ConflictException('Only draft tournament can be started');

    const approvedCount = await this.prisma.tournamentTeam.count({
      where: { tournament_id: tournamentId, status: MembershipStatus.approved },
    });
    if (approvedCount < 2) throw new ConflictException('At least 2 approved teams are required to start');

    const updated = await this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: TournamentStatus.active } });
    return { success: true, tournament: updated };
  }

  async finishTournament(tournamentId: string, userId: string) {
    const tournament = await this.ensureTournamentExists(tournamentId);
    await this.ensureTournamentOrganizer(userId, tournamentId);
    if (tournament.status !== TournamentStatus.active) throw new ConflictException('Only active tournament can be finished');

    const updated = await this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: TournamentStatus.finished } });
    return { success: true, tournament: updated };
  }

  async isTournamentOrganizer(userId: string, tournamentId: string) {
    return Boolean(await this.prisma.tournament.findFirst({ where: { id: tournamentId, created_by: userId }, select: { id: true } }));
  }

  async isTeamCaptain(userId: string, teamId: string) {
    return Boolean(
      await this.prisma.teamMember.findFirst({
        where: { user_id: userId, team_id: teamId, role: TeamMemberRole.captain, status: MembershipStatus.approved },
        select: { id: true },
      }),
    );
  }

  private async ensureTournamentOrganizer(userId: string, tournamentId: string) {
    if (!(await this.isTournamentOrganizer(userId, tournamentId))) {
      throw new ForbiddenException('Only tournament organizer can perform this action');
    }
  }

  private async ensureTournamentExists(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  private async ensureTeamExists(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundException('Team not found');
  }

  private async ensureTeamNotInTournament(tournamentId: string, teamId: string) {
    const entry = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
      select: { id: true },
    });
    if (entry) throw new ConflictException('Team is already in tournament');
  }
}
