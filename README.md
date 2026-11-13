# Horizon — Real Estate AI CRM & Voice Calling Platform

Phase 1 full-stack platform for lead management, inbound Vapi AI calling, call analysis, and analytics.

## Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript, Socket.IO
- **Database:** MySQL + Prisma
- **Voice:** Vapi AI (inbound only)

## Project structure

```
apps/
  api/     Express REST API, Prisma, Vapi webhooks, Socket.IO
  web/     Next.js dashboard
docker-compose.yml   MySQL 8
```

## Quick start

### 1. Environment

```bash
cp .env.example .env
```

Update MySQL credentials and optional Vapi/OpenAI keys.

### 2. Database

Using Docker (recommended):

```bash
# requires docker access
docker compose up -d
```

Or point `DATABASE_URL` at an existing MySQL instance and create the database:

```sql
CREATE DATABASE real_estate_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'crm_user'@'%' IDENTIFIED BY 'crm_password';
GRANT ALL ON real_estate_crm.* TO 'crm_user'@'%';
FLUSH PRIVILEGES;
```

Then:

```bash
npm install
npm run db:push
npm run db:seed
```

### 3. Run

```bash
npm run dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000  
- Health: http://localhost:4000/health  

**Default admin:** `admin@realestate.local` / `Admin123!`

## Vapi inbound setup

1. Create an assistant and phone number in Vapi.
2. Set server env vars:
   - `VAPI_API_KEY`
   - `VAPI_WEBHOOK_SECRET`
   - `VAPI_ASSISTANT_ID`
   - `VAPI_PHONE_NUMBER_ID`
3. Point the Vapi assistant/phone **Server URL** to:

```text
https://<your-public-api-host>/api/webhooks/vapi
```

4. In **Settings → AI calling agent**, configure name, voice, greeting, and system prompt (supports English + Urdu guidance). Optionally sync to Vapi.

### Call workflow

1. Customer dials the business number.
2. Vapi assistant answers inbound.
3. Webhooks post call events to the API.
4. API stores call/transcript/recording, runs interest analysis, creates/updates the lead.
5. Socket.IO pushes live dashboard/call updates.

Webhook handling includes signature verification (when secret is set), idempotent `WebhookEvent` storage, and delayed end-of-call processing.

## Main API routes

| Area | Methods | Path |
|------|---------|------|
| Auth | POST/GET | `/api/auth/login`, `/api/auth/me` |
| Leads | CRUD + import | `/api/leads`, `/api/leads/import` |
| Calls | GET | `/api/calls`, `/api/calls/:id` |
| Dashboard | GET | `/api/dashboard/stats`, `/charts`, `/analytics` |
| Settings | GET/PUT | `/api/settings/*` |
| Webhooks | POST | `/api/webhooks/vapi` |

## Outbound calling (n8n-orchestrated)

Requires an **imported** Vapi phone number (Twilio/Telnyx/etc). Free Vapi numbers are inbound-only.

**Architecture:** CRM queues campaigns → **n8n** fetches queue, dials via Vapi, writes call/lead updates back. See [`n8n/README.md`](n8n/README.md).

- Manual one-off from UI: lead **Call** button → `POST /api/outbound/calls`
- Campaigns UI: `/campaigns` → **Queue for n8n**
- n8n queue API: `GET /api/outbound/n8n/queue`

## n8n

```bash
npm run n8n
# open http://localhost:5678
# or: npm run n8n:docker
```

Import workflows from `n8n/workflows/`:
- `outbound-automation.json` — fetch queue → Vapi dial → insert call
- `vapi-events-writeback.json` — Vapi webhook → update DB

Set `N8N_SHARED_SECRET` in `.env` and the same value in workflow headers.
