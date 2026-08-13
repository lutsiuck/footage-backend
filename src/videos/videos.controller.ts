import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Authorization } from 'src/common/decorators/authorization.decorator';
import type { AuthorizedRequest } from 'src/common/types/authorized-request.type';
import { CreateCommentDto } from './dtos/create-comment.dto';
import { CreateVideoDto } from './dtos/create-video.dto';
import { VideosService } from './videos.service';

@Controller('videos')
@Authorization()
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  uploadVideo(@Body() dto: CreateVideoDto, @Req() req: AuthorizedRequest) {
    return this.videosService.uploadVideo(req.user.id, dto);
  }

  @Get('feed')
  getFeed(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.videosService.getFeed(limit, offset);
  }

  @Get(':id')
  getVideo(@Param('id', ParseUUIDPipe) id: string) {
    return this.videosService.getVideo(id);
  }

  @Post(':id/like')
  likeVideo(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.videosService.likeVideo(req.user.id, id);
  }

  @Delete(':id/like')
  unlikeVideo(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.videosService.unlikeVideo(req.user.id, id);
  }

  @Post(':id/comments')
  addComment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCommentDto, @Req() req: AuthorizedRequest) {
    return this.videosService.addComment(req.user.id, id, dto);
  }

  @Get(':id/comments')
  getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.videosService.getComments(id, limit, offset);
  }

  @Delete(':id')
  deleteVideo(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthorizedRequest) {
    return this.videosService.deleteVideo(req.user.id, id);
  }
}
