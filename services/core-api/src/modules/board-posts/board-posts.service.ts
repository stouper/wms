import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
        images: data.images || [],
        files: data.files || [],
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
    return this.prisma.boardPost.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.files !== undefined && { files: data.files }),
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
