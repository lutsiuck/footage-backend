import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VideoType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCommentDto } from './dtos/create-comment.dto';
import { CreateVideoDto } from './dtos/create-video.dto';

@Injectable()
export class VideosService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadVideo(userId: string, dto: CreateVideoDto) {
    await this.matchExists(dto.match_id);

    return this.prisma.video.create({
      data: {
        user_id: userId,
        match_id: dto.match_id,
        video_url: dto.video_url,
        thumbnail_url: dto.thumbnail_url,
        type: dto.type ?? VideoType.other,
      },
    });
  }

  async getFeed(limit = 20, offset = 0) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.video.findMany({
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatar_url: true } },
          match: {
            select: {
              id: true,
              match_date: true,
              home_team: { select: { id: true, name: true } },
              away_team: { select: { id: true, name: true } },
            },
          },
          _count: { select: { likes: true } },
        },
      }),
      this.prisma.video.count(),
    ]);

    return { items, total, limit, offset };
  }

  async getMatchVideos(matchId: string) {
    await this.matchExists(matchId);

    return this.prisma.video.findMany({
      where: { match_id: matchId },
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar_url: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
  }

  async getVideo(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        user: { select: { id: true, name: true, avatar_url: true } },
        match: {
          select: {
            id: true,
            match_date: true,
            home_team: { select: { id: true, name: true } },
            away_team: { select: { id: true, name: true } },
          },
        },
        _count: { select: { likes: true, comments: true } },
        comments: {
          orderBy: { created_at: 'desc' },
          include: { user: { select: { id: true, name: true, avatar_url: true } } },
        },
      },
    });

    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  async likeVideo(userId: string, videoId: string) {
    await this.videoExists(videoId);

    const existing = await this.prisma.like.findUnique({
      where: { user_id_video_id: { user_id: userId, video_id: videoId } },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Like already exists');

    return this.prisma.like.create({ data: { user_id: userId, video_id: videoId } });
  }

  async unlikeVideo(userId: string, videoId: string) {
    await this.videoExists(videoId);

    const existing = await this.prisma.like.findUnique({
      where: { user_id_video_id: { user_id: userId, video_id: videoId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Like not found');

    await this.prisma.like.delete({ where: { id: existing.id } });
    return { success: true };
  }

  async addComment(userId: string, videoId: string, dto: CreateCommentDto) {
    await this.videoExists(videoId);

    return this.prisma.comment.create({
      data: {
        user_id: userId,
        video_id: videoId,
        text: dto.text,
      },
      include: { user: { select: { id: true, name: true, avatar_url: true } } },
    });
  }

  async getComments(videoId: string, limit = 20, offset = 0) {
    await this.videoExists(videoId);

    const where: Prisma.CommentWhereInput = { video_id: videoId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { user: { select: { id: true, name: true, avatar_url: true } } },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async deleteVideo(userId: string, videoId: string) {
    const isOwner = await this.isVideoOwner(userId, videoId);
    if (!isOwner) throw new ForbiddenException('Only video owner can delete video');

    await this.prisma.video.delete({ where: { id: videoId } });
    return { success: true };
  }

  async videoExists(videoId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
    return Boolean(video);
  }

  async matchExists(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
    return Boolean(match);
  }

  async isVideoOwner(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { user_id: true } });
    if (!video) throw new NotFoundException('Video not found');
    return video.user_id === userId;
  }
}
