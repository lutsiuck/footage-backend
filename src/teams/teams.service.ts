import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, TeamMemberRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTeamDto } from './dtos/create-team.dto';
import type { TeamsQuery } from './types/teams-query.type';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(userId: string, dto: CreateTeamDto) {
    const existingTeam = await this.prisma.team.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' } },
      select: { id: true },
    });

    if (existingTeam) {
      throw new ConflictException('Team with this name already exists');
    }

    const team = await this.prisma.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          name: dto.name.trim(),
          city: dto.city?.trim(),
          logo_url: dto.logo_url,
          created_by: userId,
        },
      });

      await tx.teamMember.create({
        data: {
          team_id: createdTeam.id,
          user_id: userId,
          role: TeamMemberRole.captain,
          status: MembershipStatus.approved,
        },
      });

      return createdTeam;
    });

    return team;
  }

  async getTeams(query: TeamsQuery) {
    const { name, city, limit = 20, offset = 0 } = query;

    const where = {
      ...(name?.trim() ? { name: { contains: name.trim(), mode: 'insensitive' as const } } : {}),
      ...(city?.trim() ? { city: { equals: city.trim(), mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,

        include: {
          team_members: {
            where: { status: MembershipStatus.approved },
            omit: {
              user_id: true,
              joined_at: true,
              role: true,
              status: true,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar_url: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.team.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getTeamDetails(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        team_members: {
          where: { status: MembershipStatus.approved },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar_url: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return {
      id: team.id,
      name: team.name,
      city: team.city,
      logo_url: team.logo_url,
      created_by: team.created_by,
      created_at: team.created_at,
      members: team.team_members.map((member) => ({
        user_id: member.user.id,
        name: member.user.name,
        avatar: member.user.avatar_url,
        role: member.role,
      })),
    };
  }

  async joinTeam(teamId: string, userId: string) {
    await this.ensureTeamExists(teamId);

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        team_id_user_id: {
          team_id: teamId,
          user_id: userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('You have already applied to or joined this team');
    }

    await this.prisma.teamMember.create({
      data: {
        team_id: teamId,
        user_id: userId,
        role: TeamMemberRole.player,
        status: MembershipStatus.pending,
      },
    });

    return { success: true };
  }

  async invitePlayer(teamId: string, captainId: string, userId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(captainId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can invite players');
    }

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        team_id_user_id: {
          team_id: teamId,
          user_id: userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already in team members list');
    }

    await this.prisma.teamMember.create({
      data: {
        team_id: teamId,
        user_id: userId,
        role: TeamMemberRole.player,
        status: MembershipStatus.pending,
      },
    });

    return { success: true };
  }

  async approveMember(teamId: string, captainId: string, userId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(captainId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can approve applications');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        team_id_user_id: {
          team_id: teamId,
          user_id: userId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Team member request not found');
    }

    const updated = await this.prisma.teamMember.update({
      where: { id: member.id },
      data: { status: MembershipStatus.approved },
    });

    return { success: true, member: updated };
  }

  async rejectMember(teamId: string, captainId: string, userId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(captainId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can reject applications');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        team_id_user_id: {
          team_id: teamId,
          user_id: userId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Team member request not found');
    }

    if (member.role === TeamMemberRole.captain) {
      throw new ConflictException('Captain cannot be rejected');
    }

    await this.prisma.teamMember.delete({ where: { id: member.id } });

    return { success: true };
  }

  async removeMember(teamId: string, requesterId: string, userId: string) {
    await this.ensureTeamExists(teamId);

    const [captain, member] = await Promise.all([
      this.isCaptain(requesterId, teamId),
      this.prisma.teamMember.findUnique({
        where: {
          team_id_user_id: {
            team_id: teamId,
            user_id: userId,
          },
        },
      }),
    ]);

    const isSelf = requesterId === userId;

    if (!captain && !isSelf) {
      throw new ForbiddenException('Only captain or member itself can remove member');
    }

    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    if (member.role === TeamMemberRole.captain) {
      throw new ConflictException('Captain cannot leave team without role transfer');
    }

    await this.prisma.teamMember.delete({ where: { id: member.id } });

    return { success: true };
  }

  async transferCaptain(teamId: string, requesterId: string, newCaptainId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(requesterId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can transfer captain role');
    }

    if (requesterId === newCaptainId) {
      throw new ConflictException('New captain should be different');
    }

    const newCaptainMember = await this.prisma.teamMember.findUnique({
      where: {
        team_id_user_id: {
          team_id: teamId,
          user_id: newCaptainId,
        },
      },
    });

    if (!newCaptainMember || newCaptainMember.status !== MembershipStatus.approved) {
      throw new ConflictException('New captain must be an approved team member');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.update({
        where: { id: captain!.id },
        data: { role: TeamMemberRole.player },
      });

      await tx.teamMember.update({
        where: { id: newCaptainMember.id },
        data: { role: TeamMemberRole.captain },
      });

      await tx.team.update({
        where: { id: teamId },
        data: { created_by: newCaptainId },
      });
    });

    return { success: true };
  }

  async isTeamMember(userId: string, teamId: string) {
    const teamMember = await this.prisma.teamMember.findFirst({
      where: {
        user_id: userId,
        team_id: teamId,
        status: MembershipStatus.approved,
      },
      select: { id: true },
    });

    return Boolean(teamMember);
  }

  async isCaptain(userId: string, teamId: string) {
    return this.prisma.teamMember.findFirst({
      where: {
        user_id: userId,
        team_id: teamId,
        role: TeamMemberRole.captain,
        status: MembershipStatus.approved,
      },
    });
  }

  private async ensureTeamExists(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }
  }
}
