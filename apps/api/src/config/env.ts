import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  databaseUrl: required("DATABASE_URL", "mysql://crm_user:crm_password@localhost:3306/real_estate_crm"),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  vapiApiKey: process.env.VAPI_API_KEY ?? "",
  vapiWebhookSecret: process.env.VAPI_WEBHOOK_SECRET ?? "",
  vapiAssistantId: process.env.VAPI_ASSISTANT_ID ?? "",
  vapiPhoneNumberId: process.env.VAPI_PHONE_NUMBER_ID ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? "",
  n8nSharedSecret: process.env.N8N_SHARED_SECRET ?? "",
};
