import { env } from "../config/env";

export async function forwardToN8n(event: string, data: Record<string, unknown>) {
  if (!env.n8nWebhookUrl) return { sent: false, reason: "N8N_WEBHOOK_URL not set" };

  try {
    const response = await fetch(env.n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.n8nSharedSecret
          ? { "x-n8n-secret": env.n8nSharedSecret }
          : {}),
      },
      body: JSON.stringify({
        event,
        source: "real-estate-ai-crm",
        at: new Date().toISOString(),
        data,
      }),
    });

    return { sent: response.ok, status: response.status };
  } catch (error) {
    console.warn("n8n forward failed", error);
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function verifyN8nSecret(headerValue?: string) {
  if (!env.n8nSharedSecret) return true;
  return headerValue === env.n8nSharedSecret;
}
