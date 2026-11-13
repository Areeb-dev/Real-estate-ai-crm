import bcrypt from "bcryptjs";
import {
  CallStatus,
  InterestLevel,
  LeadStatus,
  PrismaClient,
  PropertyType,
  PurchasePreference,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@realestate.local";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const name = process.env.SEED_ADMIN_NAME || "Admin User";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: Role.ADMIN, isActive: true },
    create: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      phone: "+92-300-1111111",
    },
  });

  await prisma.user.upsert({
    where: { email: "agent@realestate.local" },
    update: {},
    create: {
      email: "agent@realestate.local",
      name: "Sara Agent",
      passwordHash: await bcrypt.hash("Agent123!", 12),
      role: Role.AGENT,
      phone: "+92-300-2222222",
    },
  });

  await prisma.aIAgent.deleteMany();
  await prisma.aIAgent.create({
    data: {
      name: "Ayesha",
      voice: "jennifer",
      language: "en-ur",
      greeting:
        "Assalam o Alaikum / Hello! Thank you for calling Horizon Realty. I am Ayesha, your AI real estate assistant. Are you looking to buy, sell, or rent a property today?",
      systemPrompt: `You are Ayesha, a professional AI real estate assistant for Horizon Realty.
Your goals:
1. Introduce yourself as an AI assistant.
2. Understand if the customer wants to buy, sell, or rent.
3. Ask about property type, preferred location, and budget.
4. Understand requirements and purchase timeline.
5. Qualify the lead politely.
6. Support English and Urdu; mirror the customer's language.
7. If the customer asks for a human, acknowledge and note that a team member will follow up.

Be concise, warm, and professional. Never invent inventory details you do not know.`,
      isActive: true,
    },
  });

  await prisma.setting.upsert({
    where: { key: "companyProfile" },
    update: {},
    create: {
      key: "companyProfile",
      value: {
        name: "Horizon Realty",
        email: "hello@horizonrealty.local",
        phone: "+92-300-0000000",
        address: "Lahore, Pakistan",
        website: "https://horizonrealty.local",
      },
    },
  });

  const leadCount = await prisma.lead.count();
  if (leadCount === 0) {
    const leads = await Promise.all([
      prisma.lead.create({
        data: {
          name: "Ali Khan",
          phone: "+923001234001",
          email: "ali@example.com",
          propertyType: PropertyType.APARTMENT,
          preferredLocation: "DHA Lahore",
          budgetMin: 15000000,
          budgetMax: 25000000,
          purchasePreference: PurchasePreference.BUY,
          source: "website",
          status: LeadStatus.INTERESTED,
          assignedToId: admin.id,
        },
      }),
      prisma.lead.create({
        data: {
          name: "Fatima Noor",
          phone: "+923001234002",
          email: "fatima@example.com",
          propertyType: PropertyType.HOUSE,
          preferredLocation: "Bahria Town",
          budgetMin: 30000000,
          budgetMax: 45000000,
          purchasePreference: PurchasePreference.BUY,
          source: "referral",
          status: LeadStatus.FOLLOW_UP,
        },
      }),
      prisma.lead.create({
        data: {
          name: "Usman Raza",
          phone: "+923001234003",
          propertyType: PropertyType.PLOT,
          preferredLocation: "Gulberg",
          purchasePreference: PurchasePreference.SELL,
          source: "inbound_call",
          status: LeadStatus.NEW,
        },
      }),
    ]);

    const call = await prisma.call.create({
      data: {
        vapiCallId: "seed-call-1",
        leadId: leads[0].id,
        customerName: leads[0].name,
        customerPhone: leads[0].phone,
        status: CallStatus.COMPLETED,
        startedAt: new Date(Date.now() - 3600000),
        endedAt: new Date(Date.now() - 3300000),
        durationSeconds: 300,
        interestLevel: InterestLevel.HIGH,
        interestScore: 82,
        summary: "Customer is interested in a 3-bed apartment in DHA within 25M budget.",
        recordingUrl: "https://example.com/recordings/seed-call-1.mp3",
      },
    });

    await prisma.callTranscript.create({
      data: {
        callId: call.id,
        content:
          "assistant: Hello, thank you for calling Horizon Realty.\nuser: I want to buy an apartment in DHA.\nassistant: What is your budget?\nuser: Around 2 crore to 2.5 crore.\nassistant: Great, I will have our team follow up.",
      },
    });

    await prisma.callAnalysis.create({
      data: {
        callId: call.id,
        summary: "Interested buyer for DHA apartment, budget 20–25M.",
        propertyType: PropertyType.APARTMENT,
        location: "DHA Lahore",
        budgetMin: 20000000,
        budgetMax: 25000000,
        purchaseTimeline: "within 2 months",
        customerIntent: PurchasePreference.BUY,
        interestLevel: InterestLevel.HIGH,
        interestScore: 82,
        recommendedAction: "Share matching listings and schedule a site visit.",
        extractedRequirements: {
          beds: 3,
          location: "DHA Lahore",
        },
      },
    });

    await prisma.followUp.create({
      data: {
        leadId: leads[1].id,
        dueAt: new Date(Date.now() + 86400000),
        notes: "Call back regarding Bahria Town house options.",
        assignedToId: admin.id,
      },
    });

    await prisma.notification.create({
      data: {
        type: "NEW_LEAD",
        title: "Welcome to Real Estate AI CRM",
        message: "Your workspace is ready. Configure Vapi in Settings to receive live calls.",
      },
    });
  }

  console.log("Seed complete");
  console.log(`Admin login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
