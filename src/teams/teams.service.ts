import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, TeamMemberRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTeamDto } from './dtos/create-team.dto';
import type { TeamsQuery } from './types/teams-query.type';
import { buildUploadedImagePath, deleteUploadedImage } from 'src/common/config/image-upload.config';
import { UpdateTeamDto } from './dtos/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(userId: string, dto: CreateTeamDto, logo?: Express.Multer.File) {
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
          logo_url: logo ? buildUploadedImagePath('teams', logo.filename) : null,
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

  async updateTeam(teamId: string, userId: string, dto: UpdateTeamDto, logo?: Express.Multer.File) {
    const [team, captain] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true, logo_url: true } }),
      this.isCaptain(userId, teamId),
    ]);

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (!captain) {
      throw new ForbiddenException('Only captain can update team');
    }

    const trimmedName = dto.name?.trim();
    if (trimmedName) {
      const existingTeam = await this.prisma.team.findFirst({
        where: { id: { not: teamId }, name: { equals: trimmedName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingTeam) {
        throw new ConflictException('Team with this name already exists');
      }
    }

    const nextLogoUrl = logo ? buildUploadedImagePath('teams', logo.filename) : null;
    const previousLogoUrl = team.logo_url;

    const updatedTeam = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: trimmedName,
        city: dto.city?.trim(),
        ...(nextLogoUrl ? { logo_url: nextLogoUrl } : {}),
      },
    });

    if (nextLogoUrl && previousLogoUrl && previousLogoUrl !== nextLogoUrl) {
      await deleteUploadedImage(previousLogoUrl);
    }

    return updatedTeam;
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

    const teams = items.map((item) => ({
      ...item,
      team_members: item.team_members.map((member) => ({
        user_id: member.user.id,
        name: member.user.name,
        avatar_url: member.user.avatar_url,
        id: member.id,
        team_id: member.team_id,
      })),
    }));

    return { items: teams, total, limit, offset };
  }

  async getTeamDetails(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        team_members: {
          // where: { status: MembershipStatus.approved },
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
      team_members: team.team_members.map((member) => ({
        user_id: member.user.id,
        name: member.user.name,
        avatar_url: member.user.avatar_url,
        role: member.role,
        status: member.status,
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
        status: MembershipStatus.requested,
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
        status: MembershipStatus.invited,
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

  async getInvitations(teamId: string) {
    await this.ensureTeamExists(teamId);

    const invitations = await this.prisma.tournamentTeam.findMany({
      where: {
        team_id: teamId,
        status: MembershipStatus.invited,
      },
      omit: {
        tournament_id: true,
        status: true,
      },
      include: {
        tournament: true,
      },
    });

    return invitations;
  }

  async approveInvitation(tournamentId: string, userId: string, teamId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(userId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can approve to team');
    }

    const item = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
    });
    if (!item) throw new NotFoundException('Team application not found');

    const updated = await this.prisma.tournamentTeam.update({ where: { id: item.id }, data: { status: MembershipStatus.approved } });
    return { success: true, tournament_team: updated };
  }

  async rejectInvitation(tournamentId: string, userId: string, teamId: string) {
    await this.ensureTeamExists(teamId);

    const captain = await this.isCaptain(userId, teamId);
    if (!captain) {
      throw new ForbiddenException('Only captain can reject team');
    }

    const item = await this.prisma.tournamentTeam.findUnique({
      where: { tournament_id_team_id: { tournament_id: tournamentId, team_id: teamId } },
    });
    if (!item) throw new NotFoundException('Team application not found');

    await this.prisma.tournamentTeam.delete({ where: { id: item.id } });
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

  async searchPlayers(teamId: string, name?: string) {
    await this.ensureTeamExists(teamId);

    const players = await this.prisma.user.findMany({
      where: {
        name: { contains: name?.trim(), mode: 'insensitive' as const },
        team_members: {
          none: {
            team_id: teamId,
          },
        },
      },

      select: {
        id: true,
        name: true,
        avatar_url: true,
      },
    });

    return players;
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
