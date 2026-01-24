import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BoardPostsService } from './board-posts.service';
import { PrismaService } from '../../prisma/prisma.service';

interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

// Prisma include된 결과 타입
interface BoardPostWithAuthor {
  id: string;
  title: string;
  content: string;
  authorId: string;
  images: unknown;
  files: unknown;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
  };
}

@Controller('board-posts')
export class BoardPostsController {
  constructor(
    private boardPostsService: BoardPostsService,
    private prisma: PrismaService,
  ) {}

  // GET /board-posts - 게시글 목록 조회
  @Get()
  async findAll(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const posts = (await this.boardPostsService.findAll(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    )) as BoardPostWithAuthor[];

    const total = await this.boardPostsService.count();

    return {
      rows: posts.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        authorId: post.authorId,
        authorName: post.author.name,
        images: post.images as string[] | null,
        files: post.files as FileAttachment[] | null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      })),
      total,
    };
  }

  // GET /board-posts/:id - 게시글 단건 조회
  @Get(':id')
  async findById(@Param('id') id: string) {
    const post = await this.boardPostsService.findById(id);

    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      authorId: post.authorId,
      authorName: post.author.name,
      images: post.images as string[] | null,
      files: post.files as FileAttachment[] | null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  // POST /board-posts - 게시글 생성
  @Post()
  async create(
    @Body()
    body: {
      firebaseUid: string;
      title: string;
      content: string;
      images?: string[];
      files?: FileAttachment[];
    },
  ) {
    if (!body.firebaseUid || !body.title || !body.content) {
      return { success: false, error: 'firebaseUid, title, content are required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    try {
      const post = (await this.boardPostsService.create({
        title: body.title,
        content: body.content,
        authorId: employee.id,
        images: body.images,
        files: body.files,
      })) as BoardPostWithAuthor;

      return {
        success: true,
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          authorId: post.authorId,
          authorName: post.author.name,
          images: post.images as string[] | null,
          files: post.files as FileAttachment[] | null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // PATCH /board-posts/:id - 게시글 수정
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      firebaseUid: string;
      title?: string;
      content?: string;
      images?: string[];
      files?: FileAttachment[];
    },
  ) {
    if (!body.firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // 게시글 조회
    const existingPost = await this.boardPostsService.findById(id);
    if (!existingPost) {
      return { success: false, error: 'Post not found' };
    }

    // 본인 또는 관리자만 수정 가능
    const isOwner = existingPost.authorId === employee.id;
    const isAdmin = employee.role === 'HQ_ADMIN' || employee.role === 'HQ_WMS';

    if (!isOwner && !isAdmin) {
      return { success: false, error: '수정 권한이 없습니다.' };
    }

    try {
      const post = (await this.boardPostsService.update(id, {
        title: body.title,
        content: body.content,
        images: body.images,
        files: body.files,
      })) as BoardPostWithAuthor;

      return {
        success: true,
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          authorId: post.authorId,
          authorName: post.author.name,
          images: post.images as string[] | null,
          files: post.files as FileAttachment[] | null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // DELETE /board-posts/:id - 게시글 삭제
  @Delete(':id')
  async delete(@Param('id') id: string, @Body('firebaseUid') firebaseUid: string) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // 게시글 조회
    const existingPost = await this.boardPostsService.findById(id);
    if (!existingPost) {
      return { success: false, error: 'Post not found' };
    }

    // 본인 또는 관리자만 삭제 가능
    const isOwner = existingPost.authorId === employee.id;
    const isAdmin = employee.role === 'HQ_ADMIN' || employee.role === 'HQ_WMS';

    if (!isOwner && !isAdmin) {
      return { success: false, error: '삭제 권한이 없습니다.' };
    }

    try {
      await this.boardPostsService.delete(id);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}
