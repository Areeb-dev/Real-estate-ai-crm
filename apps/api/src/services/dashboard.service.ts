import { CallStatus, InterestLevel, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getDashboardStats() {
  const today = startOfDay();

  const [
    totalLeads,
    newLeads,
    totalCallsToday,
    answeredCalls,
    missedCalls,
    interestedLeads,
    notInterestedLeads,
    followUpsRequired,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: LeadStatus.NEW } }),
    prisma.call.count({ where: { createdAt: { gte: today } } }),
    prisma.call.count({
      where: { createdAt: { gte: today }, status: CallStatus.COMPLETED },
    }),
    prisma.call.count({
      where: { createdAt: { gte: today }, status: CallStatus.MISSED },
    }),
    prisma.lead.count({ where: { status: LeadStatus.INTERESTED } }),
    prisma.lead.count({ where: { status: LeadStatus.NOT_INTERESTED } }),
    prisma.followUp.count({ where: { status: "PENDING" } }),
  ]);

  return {
    totalLeads,
    newLeads,
    totalCallsToday,
    answeredCalls,
    missedCalls,
    interestedLeads,
    notInterestedLeads,
    followUpsRequired,
  };
}

export async function getDashboardCharts(days = 30) {
  const from = daysAgo(days);

  const [calls, leads] = await Promise.all([
    prisma.call.findMany({
      where: { createdAt: { gte: from } },
      select: {
        createdAt: true,
        status: true,
        interestLevel: true,
        durationSeconds: true,
      },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: from } },
      select: {
        createdAt: true,
        status: true,
        propertyType: true,
        budgetMin: true,
        budgetMax: true,
      },
    }),
  ]);

  const callsOverTime = bucketByDay(calls.map((c) => c.createdAt), days);
  const leadsOverTime = bucketByDay(leads.map((l) => l.createdAt), days);

  const interestBreakdown = [
    { name: "Interested", value: leads.filter((l) => l.status === LeadStatus.INTERESTED).length },
    {
      name: "Not Interested",
      value: leads.filter((l) => l.status === LeadStatus.NOT_INTERESTED).length,
    },
    {
      name: "Follow-up",
      value: leads.filter((l) => l.status === LeadStatus.FOLLOW_UP).length,
    },
    {
      name: "Other",
      value: leads.filter(
        (l) =>
          !(
            [
              LeadStatus.INTERESTED,
              LeadStatus.NOT_INTERESTED,
              LeadStatus.FOLLOW_UP,
            ] as LeadStatus[]
          ).includes(l.status)
      ).length,
    },
  ];

  const callPerformance = [
    { name: "Completed", value: calls.filter((c) => c.status === CallStatus.COMPLETED).length },
    { name: "Missed", value: calls.filter((c) => c.status === CallStatus.MISSED).length },
    { name: "Failed", value: calls.filter((c) => c.status === CallStatus.FAILED).length },
    { name: "In Progress", value: calls.filter((c) => c.status === CallStatus.IN_PROGRESS || c.status === CallStatus.RINGING).length },
  ];

  const propertyDistribution = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      const key = lead.propertyType || "UNKNOWN";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const budgetBuckets = [
    { name: "< 5M", value: 0 },
    { name: "5M–15M", value: 0 },
    { name: "15M–50M", value: 0 },
    { name: "50M+", value: 0 },
    { name: "Unknown", value: 0 },
  ];

  for (const lead of leads) {
    const budget = Number(lead.budgetMax ?? lead.budgetMin ?? NaN);
    if (!Number.isFinite(budget)) {
      budgetBuckets[4].value += 1;
    } else if (budget < 5_000_000) budgetBuckets[0].value += 1;
    else if (budget < 15_000_000) budgetBuckets[1].value += 1;
    else if (budget < 50_000_000) budgetBuckets[2].value += 1;
    else budgetBuckets[3].value += 1;
  }

  const recentCalls = await prisma.call.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { id: true, name: true } } },
  });

  const recentLeads = await prisma.lead.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
  });

  return {
    callsOverTime,
    leadsOverTime,
    interestBreakdown,
    callPerformance,
    propertyDistribution,
    budgetDistribution: budgetBuckets,
    recentCalls,
    recentLeads,
  };
}

export async function getAnalytics(from?: string, to?: string) {
  const whereCalls: Prisma.CallWhereInput = {};
  const whereLeads: Prisma.LeadWhereInput = {};
  if (from || to) {
    whereCalls.createdAt = {};
    whereLeads.createdAt = {};
    if (from) {
      whereCalls.createdAt.gte = new Date(from);
      whereLeads.createdAt.gte = new Date(from);
    }
    if (to) {
      whereCalls.createdAt.lte = new Date(to);
      whereLeads.createdAt.lte = new Date(to);
    }
  }

  const [calls, leads, followUps] = await Promise.all([
    prisma.call.findMany({ where: whereCalls }),
    prisma.lead.findMany({ where: whereLeads }),
    prisma.followUp.count({
      where: {
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
    }),
  ]);

  const completed = calls.filter((c) => c.status === CallStatus.COMPLETED).length;
  const interested = leads.filter((l) => l.status === LeadStatus.INTERESTED || l.status === LeadStatus.QUALIFIED).length;
  const conversionRate = leads.length ? Number(((interested / leads.length) * 100).toFixed(1)) : 0;
  const answerRate = calls.length ? Number(((completed / calls.length) * 100).toFixed(1)) : 0;

  return {
    totals: {
      calls: calls.length,
      leads: leads.length,
      completedCalls: completed,
      missedCalls: calls.filter((c) => c.status === CallStatus.MISSED).length,
      interestedLeads: interested,
      followUps,
      conversionRate,
      answerRate,
      avgInterestScore:
        calls.filter((c) => c.interestScore != null).reduce((s, c) => s + (c.interestScore || 0), 0) /
          (calls.filter((c) => c.interestScore != null).length || 1) || 0,
    },
    interestLevels: Object.values(InterestLevel).map((level) => ({
      name: level,
      value: calls.filter((c) => c.interestLevel === level).length,
    })),
    leadStatuses: Object.values(LeadStatus).map((status) => ({
      name: status,
      value: leads.filter((l) => l.status === status).length,
    })),
    propertyPreferences: Object.entries(
      leads.reduce<Record<string, number>>((acc, lead) => {
        const key = lead.propertyType || "UNKNOWN";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value })),
  };
}

function bucketByDay(dates: Date[], days: number) {
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: 0 });
  }
  const index = new Map(result.map((r, i) => [r.date, i]));
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    const i = index.get(key);
    if (i != null) result[i].count += 1;
  }
  return result;
}
