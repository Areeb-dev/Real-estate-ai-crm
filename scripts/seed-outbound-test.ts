/**
 * Seed outbound test data so n8n queue returns leads.
 *
 * Usage:
 *   npx tsx scripts/seed-outbound-test.ts
 */
import { PrismaClient, CampaignLeadStatus, CampaignStatus, LeadStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const leadsData = [
    {
      name: "Areeb",
      phone: "+923363123857",
      email: "areeb@example.com",
      status: LeadStatus.FOLLOW_UP,
      preferredLocation: "Lahore",
      source: "test",
      notes: "Outbound test lead",
    },
    {
      name: "Sara Khan",
      phone: "+923001112233",
      email: "sara@example.com",
      status: LeadStatus.INTERESTED,
      preferredLocation: "DHA Lahore",
      source: "test",
      notes: "Dummy buyer for n8n dial test",
    },
    {
      name: "Bilal Ahmed",
      phone: "+923004445566",
      email: "bilal@example.com",
      status: LeadStatus.PENDING,
      preferredLocation: "Bahria Town",
      source: "test",
      notes: "Dummy lead 2",
    },
  ];

  const leads = [];
  for (const data of leadsData) {
    const lead = await prisma.lead.upsert({
      where: { phone: data.phone },
      update: {
        name: data.name,
        email: data.email,
        status: data.status,
        preferredLocation: data.preferredLocation,
        notes: data.notes,
        source: data.source,
      },
      create: data,
    });
    // Also merge any legacy phone format for Areeb
    leads.push(lead);
  }

  // Normalize older Areeb phone if present under a different format
  const legacy = await prisma.lead.findFirst({
    where: { name: "Areeb", phone: { not: "+923363123857" } },
  });
  if (legacy) {
    await prisma.campaignLead.deleteMany({ where: { leadId: legacy.id } });
    await prisma.lead.delete({ where: { id: legacy.id } }).catch(() => undefined);
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: `n8n Test Campaign ${new Date().toISOString().slice(0, 16)}`,
      description: "Auto-seeded for n8n outbound queue testing",
      status: CampaignStatus.RUNNING,
      startedAt: new Date(),
      maxRetries: 1,
      retryDelayMins: 60,
      leads: {
        create: leads.map((lead) => ({
          leadId: lead.id,
          status: CampaignLeadStatus.QUEUED,
        })),
      },
    },
    include: {
      leads: { include: { lead: true } },
    },
  });

  console.log("Seeded outbound test data");
  console.log(`Campaign: ${campaign.id} (${campaign.name}) [${campaign.status}]`);
  console.log(`Leads queued: ${campaign.leads.length}`);
  for (const row of campaign.leads) {
    console.log(`  - ${row.lead.name} ${row.lead.phone} [${row.status}]`);
  }
  console.log("\nTest queue:");
  console.log(
    `curl -H "x-n8n-secret: change-me-n8n-secret" "http://localhost:4000/api/outbound/n8n/queue"`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
