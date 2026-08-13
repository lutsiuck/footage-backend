import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchEventType, MatchStatus, MembershipStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMatchDto } from './dtos/create-match.dto';
import { UpdateScoreDto } from './dtos/update-score.dto';
import { CreateMatchEventDto } from './dtos/create-match-event.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async createMatch(userId: string, dto: CreateMatchDto) {
    if (dto.home_team_id === dto.away_team_id) throw new BadRequestException('home_team_id and away_team_id must be different');
    const tournament = await this.ensureTournamentExists(dto.tournament_id);
    await this.ensureTournamentOrganizer(userId, tournament.id);

    const [homeOk, awayOk] = await Promise.all([
      this.isTeamInTournament(dto.home_team_id, tournament.id),
      this.isTeamInTournament(dto.away_team_id, tournament.id),
    ]);
    if (!homeOk || !awayOk) throw new BadRequestException('Both teams must be approved in tournament');

    const date = new Date(dto.match_date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('match_date must be a valid date');

    return this.prisma.match.create({
      data: {
        tournament_id: tournament.id,
        home_team_id: dto.home_team_id,
        away_team_id: dto.away_team_id,
        match_date: date,
        status: MatchStatus.scheduled,
        home_score: 0,
        away_score: 0,
      },
    });
  }

  async getMatches(query: { tournament_id?: string; team_id?: string; date?: string; limit?: number; offset?: number }) {
    const { tournament_id, team_id, date, limit = 20, offset = 0 } = query;
    let dateFilter: { gte: Date; lt: Date } | undefined;
    if (date) {
      const day = new Date(date);
      if (Number.isNaN(day.getTime())) throw new BadRequestException('date must be a valid date');
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      dateFilter = { gte: start, lt: end };
    }

    const where = {
      ...(tournament_id ? { tournament_id } : {}),
      ...(team_id ? { OR: [{ home_team_id: team_id }, { away_team_id: team_id }] } : {}),
      ...(dateFilter ? { match_date: dateFilter } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.match.findMany({
        where,
        orderBy: { match_date: 'desc' },
        skip: offset,
        take: limit,
        include: { home_team: { select: { id: true, name: true } }, away_team: { select: { id: true, name: true } } },
      }),
      this.prisma.match.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getMatchDetails(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: { select: { id: true, name: true } },
        home_team: { select: { id: true, name: true, logo_url: true } },
        away_team: { select: { id: true, name: true, logo_url: true } },
        match_events: { orderBy: { minute: 'asc' }, include: { player: { select: { id: true, name: true, avatar_url: true } } } },
        videos: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async getMatchVideos(matchId: string) {
    await this.ensureMatchExists(matchId);

    return this.prisma.video.findMany({
      where: { match_id: matchId },
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar_url: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
  }

  async updateScore(matchId: string, userId: string, dto: UpdateScoreDto) {
    const match = await this.ensureMatchExists(matchId);
    await this.ensureTournamentOrganizer(userId, match.tournament_id);
    return this.prisma.match.update({ where: { id: matchId }, data: { home_score: dto.home_score, away_score: dto.away_score } });
  }

  async finishMatch(matchId: string, userId: string) {
    const match = await this.ensureMatchExists(matchId);
    await this.ensureTournamentOrganizer(userId, match.tournament_id);
    return this.prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.finished } });
  }

  async addEvent(matchId: string, userId: string, dto: CreateMatchEventDto) {
    const match = await this.ensureMatchExists(matchId);
    await this.ensureTournamentOrganizer(userId, match.tournament_id);
    if (!(await this.isPlayerInMatch(dto.player_id, matchId))) throw new BadRequestException('Player is not in this match');

    return this.prisma.matchEvent.create({
      data: { match_id: matchId, player_id: dto.player_id, type: dto.type as MatchEventType, minute: dto.minute },
    });
  }

  async deleteEvent(matchId: string, eventId: string, userId: string) {
    const match = await this.ensureMatchExists(matchId);
    await this.ensureTournamentOrganizer(userId, match.tournament_id);
    const event = await this.prisma.matchEvent.findUnique({ where: { id: eventId }, select: { id: true, match_id: true } });
    if (!event || event.match_id !== matchId) throw new NotFoundException('Match event not found');
    await this.prisma.matchEvent.delete({ where: { id: eventId } });
    return { success: true };
  }

  async isTournamentOrganizer(userId: string, tournamentId: string) {
    return Boolean(await this.prisma.tournament.findFirst({ where: { id: tournamentId, created_by: userId }, select: { id: true } }));
  }

  async isTeamInTournament(teamId: string, tournamentId: string) {
    return Boolean(
      await this.prisma.tournamentTeam.findFirst({
        where: { team_id: teamId, tournament_id: tournamentId, status: MembershipStatus.approved },
        select: { id: true },
      }),
    );
  }

  async isPlayerInMatch(playerId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, select: { home_team_id: true, away_team_id: true } });
    if (!match) return false;
    return Boolean(
      await this.prisma.teamMember.findFirst({
        where: { user_id: playerId, team_id: { in: [match.home_team_id, match.away_team_id] }, status: MembershipStatus.approved },
        select: { id: true },
      }),
    );
  }

  private async ensureTournamentOrganizer(userId: string, tournamentId: string) {
    if (!(await this.isTournamentOrganizer(userId, tournamentId)))
      throw new ForbiddenException('Only tournament organizer can perform this action');
  }

  private async ensureTournamentExists(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  private async ensureMatchExists(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, select: { id: true, tournament_id: true, status: true } });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }
}
