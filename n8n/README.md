# n8n owns outbound automation

The CRM **does not dial campaign leads in code**. It only:

1. Lets you create campaigns / queue leads in the UI  
2. Exposes thin DB read/write APIs for n8n  
3. Shows results in Dashboard / Calls / Leads  

**n8n** fetches the queue, calls Vapi, and writes results back.

```
CRM UI → Queue campaign
   ↓
n8n (every 5 min / webhook)
   ↓
GET /api/outbound/n8n/queue     ← read leads from DB
   ↓
POST https://api.vapi.ai/call   ← place outbound call
   ↓
POST /api/outbound/n8n/calls/started  ← insert call row
   ↓
Vapi finishes → n8n webhook
   ↓
POST /api/outbound/n8n/calls/result   ← update call + lead
```

## Start n8n

```bash
# from project root
npm run n8n
# UI: http://localhost:5678

# or Docker
npm run n8n:docker
```

## Import workflows

1. Open n8n → **Workflows → Import**
2. Import:
   - `n8n/workflows/outbound-automation.json`
   - `n8n/workflows/vapi-events-writeback.json`
3. Replace `change-me-n8n-secret` with the same value as `N8N_SHARED_SECRET` in `.env`
4. Set n8n env vars (Settings → Variables, or process env):
   - `VAPI_API_KEY`
   - `VAPI_ASSISTANT_ID`
   - `VAPI_PHONE_NUMBER_ID`
5. If n8n runs on the host (not Docker), change `host.docker.internal:4000` → `localhost:4000`
6. Activate both workflows

## Point Vapi at n8n for call events

In Vapi assistant/phone **Server URL**:

```text
http://localhost:5678/webhook/vapi-events
```

(Use a public tunnel URL in production.)

CRM `.env` can keep forwarding optional events via `N8N_WEBHOOK_URL`, but outbound write-back should go through the n8n Vapi webhook above.

## CRM endpoints used by n8n

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/outbound/n8n/queue` | Fetch queued leads |
| POST | `/api/outbound/n8n/calls/started` | Insert outbound call |
| POST | `/api/outbound/n8n/calls/result` | Update call/lead after finish |
| POST | `/api/outbound/n8n/calls/failed` | Mark campaign lead failed |

All require header: `x-n8n-secret: <N8N_SHARED_SECRET>`

## Day-to-day flow

1. Create campaign in **Campaigns** UI and select leads  
2. Click **Queue for n8n** (starts campaign = queued, does not dial)  
3. n8n schedule/webhook picks up the queue and dials  
4. Results appear in **Calls** / **Leads** automatically  

## Optional: MySQL node instead of HTTP queue

You can replace “Fetch queue” with a MySQL node:

```sql
SELECT cl.id AS campaignLeadId, cl.campaign_id AS campaignId, cl.attempts,
       l.id AS leadId, l.name, l.phone, c.assistant_id, c.phone_number_id
FROM campaign_leads cl
JOIN leads l ON l.id = cl.lead_id
JOIN campaigns c ON c.id = cl.campaign_id
WHERE c.status = 'RUNNING'
  AND cl.status IN ('QUEUED', 'PENDING', 'MISSED')
LIMIT 20;
```

Prefer the HTTP queue APIs unless you specifically want raw SQL in n8n.
