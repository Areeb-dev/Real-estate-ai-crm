import {
  LeadStatus,
  Prisma,
  PropertyType,
  PurchasePreference,
} from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { emitLeadUpdate, emitDashboardRefresh } from "../sockets";

export interface LeadFilters {
  search?: string;
  status?: LeadStatus;
  source?: string;
  propertyType?: PropertyType;
  page?: number;
  limit?: number;
}

export async function listLeads(filters: LeadFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.LeadWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.propertyType) where.propertyType = filters.propertyType;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { phone: { contains: filters.search } },
      { email: { contains: filters.search } },
      { preferredLocation: { contains: filters.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { calls: true } },
      },
    }),
    prisma.lead.count({ where }),
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

export async function getLeadById(id: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      calls: {
        orderBy: { createdAt: "desc" },
        include: {
          analysis: true,
          transcript: { select: { id: true, createdAt: true } },
        },
      },
      followUps: { orderBy: { dueAt: "asc" } },
    },
  });
  if (!lead) throw new AppError("Lead not found", 404);
  return lead;
}

export async function createLead(data: {
  name: string;
  phone: string;
  email?: string;
  propertyType?: PropertyType;
  preferredLocation?: string;
  budgetMin?: number;
  budgetMax?: number;
  purchasePreference?: PurchasePreference;
  source?: string;
  status?: LeadStatus;
  notes?: string;
  assignedToId?: string;
}) {
  const existing = await prisma.lead.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError("A lead with this phone number already exists", 409);
  }

  const lead = await prisma.lead.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email,
      propertyType: data.propertyType,
      preferredLocation: data.preferredLocation,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
      purchasePreference: data.purchasePreference ?? PurchasePreference.UNKNOWN,
      source: data.source ?? "manual",
      status: data.status ?? LeadStatus.NEW,
      notes: data.notes,
      assignedToId: data.assignedToId,
    },
  });

  emitLeadUpdate(lead);
  emitDashboardRefresh();
  return lead;
}

export async function updateLead(
  id: string,
  data: Partial<{
    name: string;
    phone: string;
    email: string | null;
    propertyType: PropertyType | null;
    preferredLocation: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    purchasePreference: PurchasePreference;
    source: string;
    status: LeadStatus;
    notes: string | null;
    assignedToId: string | null;
  }>
) {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError("Lead not found", 404);

  if (data.phone && data.phone !== existing.phone) {
    const phoneTaken = await prisma.lead.findUnique({ where: { phone: data.phone } });
    if (phoneTaken) throw new AppError("Phone number already in use", 409);
  }

  const lead = await prisma.lead.update({ where: { id }, data });
  emitLeadUpdate(lead);
  emitDashboardRefresh();
  return lead;
}

export async function deleteLead(id: string) {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError("Lead not found", 404);
  await prisma.lead.delete({ where: { id } });
  emitDashboardRefresh();
  return { success: true };
}

export async function findOrCreateLeadFromCall(input: {
  phone: string;
  name?: string | null;
}) {
  const existing = await prisma.lead.findUnique({ where: { phone: input.phone } });
  if (existing) return existing;

  const lead = await prisma.lead.create({
    data: {
      name: input.name?.trim() || `Caller ${input.phone}`,
      phone: input.phone,
      source: "inbound_call",
      status: LeadStatus.NEW,
    },
  });
  emitLeadUpdate(lead);
  return lead;
}

export async function importLeads(
  rows: Array<{
    name: string;
    phone: string;
    email?: string;
    propertyType?: string;
    preferredLocation?: string;
    budgetMin?: number;
    budgetMax?: number;
    purchasePreference?: string;
    source?: string;
    status?: string;
    notes?: string;
  }>
) {
  let created = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.name || !row.phone) {
        skipped += 1;
        errors.push({ row: i + 1, message: "Name and phone are required" });
        continue;
      }

      const existing = await prisma.lead.findUnique({ where: { phone: String(row.phone) } });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.lead.create({
        data: {
          name: String(row.name),
          phone: String(row.phone),
          email: row.email ? String(row.email) : undefined,
          propertyType: parseEnum(PropertyType, row.propertyType),
          preferredLocation: row.preferredLocation ? String(row.preferredLocation) : undefined,
          budgetMin: row.budgetMin != null ? Number(row.budgetMin) : undefined,
          budgetMax: row.budgetMax != null ? Number(row.budgetMax) : undefined,
          purchasePreference:
            parseEnum(PurchasePreference, row.purchasePreference) ?? PurchasePreference.UNKNOWN,
          source: row.source ? String(row.source) : "import",
          status: parseEnum(LeadStatus, row.status) ?? LeadStatus.NEW,
          notes: row.notes ? String(row.notes) : undefined,
        },
      });
      created += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        row: i + 1,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  emitDashboardRefresh();
  return { created, skipped, errors };
}

function parseEnum<T extends Record<string, string>>(
  enumObj: T,
  value?: string
): T[keyof T] | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (Object.values(enumObj).includes(normalized)) {
    return normalized as T[keyof T];
  }
  return undefined;
}
