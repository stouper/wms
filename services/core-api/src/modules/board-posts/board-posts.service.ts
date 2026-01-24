import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

@Injectable()
export class BoardPostsService {
  constructor(private prisma: PrismaService) {}

  // 게시글 목록 조회 (최신순)
  async findAll(limit = 50, offset = 0) {
    return this.prisma.boardPost.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 게시글 단건 조회
  async findById(id: string) {
    return this.prisma.boardPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 게시글 생성
  async create(data: {
    title: string;
    content: string;
    authorId: string;
    images?: string[];
    files?: FileAttachment[];
  }) {
    return this.prisma.boardPost.create({
      data: {
        title: data.title,
        content: data.content,
        authorId: data.authorId,
        images: (data.images || []) as Prisma.InputJsonValue,
        files: (data.files || []) as Prisma.InputJsonValue,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 게시글 수정
  async update(
    id: string,
    data: {
      title?: string;
      content?: string;
      images?: string[];
      files?: FileAttachment[];
    },
  ) {
    const updateData: Prisma.BoardPostUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.images !== undefined) updateData.images = data.images as Prisma.InputJsonValue;
    if (data.files !== undefined) updateData.files = data.files as Prisma.InputJsonValue;

    return this.prisma.boardPost.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 게시글 삭제
  async delete(id: string) {
    return this.prisma.boardPost.delete({
      where: { id },
    });
  }

  // 게시글 수 조회
  async count() {
    return this.prisma.boardPost.count();
  }
}
