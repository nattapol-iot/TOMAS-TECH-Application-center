# Site Monitor: customer sites without a VPN (Cloudflare Tunnel)

The web app is reachable only inside the company network (Tailscale). TMT Control Panel on a
customer's server therefore cannot report to Site Monitor unless it is given one public address. A
Cloudflare Tunnel provides it without opening any port here, and without a VPN at the customer:

```
Customer server ── HTTPS 443 out ──► Cloudflare ──► tunnel (outbound from here) ──► cloudflared ──► api:5106
TMT Control Panel                    monitor-agent.tomastc.com                      (compose)
```

## What is exposed

Only the agent API, `/api/v1/monitor/agent/*`: ping, heartbeat, the command long-poll, command
results and program-update downloads. Each call needs the machine's agent key (stored only as a
SHA-256 hash, revocable on the web).

Three layers keep everything else private:

1. The tunnel's public hostname routes only that path (set up below).
2. The API itself: on the agent hostname every other route answers **404**, whatever the tunnel
   routes (`agentHostAllows` in `backend-node/src/site-monitor.ts`, checked in `app.ts`). The
   screens, sign-in, `/health` and every other API stay on the private address.
3. Wrong agent keys are limited to 20 per address per minute (then 429), and agent request bodies
   to 4 MiB.

## 1. Cloudflare (Zero Trust → Networks → Tunnels)

Use a tunnel whose connector runs **in this compose project** (option A). Do not paste the token of
a tunnel that already runs elsewhere: Cloudflare would load-balance that tunnel's other hostnames
between both connectors.

**Option A, recommended: a tunnel for this app**

1. Create a tunnel (cloudflared type), e.g. `iot-team-center-site-monitor`. Copy its token.
2. Public hostname:
   - Subdomain / domain: `monitor-agent` . `tomastc.com`
   - Path: `^/api/v1/monitor/agent/`
   - Service: `HTTP` → `api:5106`
3. Nothing else on this tunnel. Requests that match no route get Cloudflare's 404.

**Option B: an existing tunnel already running on the Mac mini host**

Add the same public hostname and path to that tunnel, with service `http://localhost:5105` (the
API's host-only port). Check first, on the Mac mini, that `curl http://localhost:5105/health/live`
answers; if it does not, use option A. With option B leave `CLOUDFLARE_TUNNEL_TOKEN` unset.

**Security settings for the hostname (recommended)**

- *Security → Bots*: Bot Fight Mode challenges non-browser clients. Add a WAF custom rule *Skip*
  for `http.host eq "monitor-agent.tomastc.com"` (or turn Bot Fight Mode off for it), otherwise the
  Control Panel gets an HTML challenge instead of JSON.
- *Security → WAF → Rate limiting*: e.g. 120 requests per minute per IP on that host. A machine
  normally makes about 6 per minute.
- Optional: allow only the customers' public IPs (WAF rule *Block* when `ip.src` is not in the list).

## 2. `.env` on the Mac mini deploy directory

```
SITE_MONITOR_AGENT_URL     https://monitor-agent.tomastc.com
CLOUDFLARE_TUNNEL_TOKEN    <token from step 1, option A only>
```

`SITE_MONITOR_AGENT_URL` alone also adds the hostname to the API's AllowedHosts. Then run the
normal deploy. `scripts/macos/deploy.sh` starts `cloudflared` (compose profile `tunnel`) after the
application is healthy and checks the tunnel:

- `…/api/v1/monitor/agent/ping` must answer **401** (the agent API is reached, no key sent);
- `…/api/v1/monitor/sites` must answer **404** (nothing else is exposed).

Anything else is a warning in the deploy log; the application itself is never stopped by the tunnel.

## 3. Each customer machine

1. Web: **Site Monitor → site → Add machine**. The dialog shows the tunnel URL as *Server URL* and
   the key (once).
2. Customer IT: allow **outbound HTTPS (443)** to `monitor-agent.tomastc.com`. Nothing inbound.
3. TMT Control Panel: **Admin… → Web monitor…** → Server URL + agent key → *Test connection* →
   *Enable* → Save. If the server must use an HTTP proxy, enter it there.

## Troubleshooting

| What the Control Panel or curl sees | Meaning |
|---|---|
| `401 invalid_agent_key` on ping | Tunnel works; the key is wrong or revoked. |
| `404 not_found` (JSON) on an agent path | Wrong path, or the tunnel routes elsewhere. |
| `400 Host is not allowed` | `SITE_MONITOR_AGENT_URL` not set (or not deployed yet). |
| HTML page / 403 / challenge | Bot Fight Mode or a WAF rule; add the skip rule above. |
| `502` / `530` from Cloudflare | `cloudflared` is not running or the service URL is wrong (`docker compose --profile tunnel logs cloudflared`). |
| `429 rate_limited` | Too many wrong keys from that address; wait a minute. |
| Timeout from the customer server | Customer firewall/proxy blocks 443 to the hostname. |
