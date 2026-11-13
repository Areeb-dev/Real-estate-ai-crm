import { CallStatus, InterestLevel, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";

export interface CallFilters {
  search?: string;
  status?: CallStatus;
  interestLevel?: InterestLevel;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listCalls(filters: CallFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.CallWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.interestLevel) where.interestLevel = filters.interestLevel;
  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search } },
      { customerPhone: { contains: filters.search } },
      { summary: { contains: filters.search } },
    ];
  }
  if (filters.from || filters.to) {
    where.startedAt = {};
    if (filters.from) where.startedAt.gte = new Date(filters.from);
    if (filters.to) where.startedAt.lte = new Date(filters.to);
  }

  const [items, total] = await Promise.all([
    prisma.call.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { id: true, name: true, status: true } },
        analysis: {
          select: {
            interestScore: true,
            interestLevel: true,
            recommendedAction: true,
          },
        },
      },
    }),
    prisma.call.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getCallById(id: string) {
  const call = await prisma.call.findUnique({
    where: { id },
    include: {
      lead: true,
      transcript: true,
      analysis: true,
      followUps: true,
    },
  });
  if (!call) throw new AppError("Call not found", 404);
  return call;
}
