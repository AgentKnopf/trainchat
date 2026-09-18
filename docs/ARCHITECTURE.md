# TrainChat — Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Components](#system-components)
3. [Data Flow](#data-flow)
4. [Room Assignment](#room-assignment)
5. [Identity System](#identity-system)
6. [Message Lifecycle](#message-lifecycle)
7. [Security Architecture](#security-architecture)
8. [Known Limitations](#known-limitations)
9. [Deployment](#deployment)
10. [Future Roadmap](#future-roadmap)

---

## Overview

TrainChat is a zero-install, browser-based ephemeral chat for people on the same WiFi network. The architecture is intentionally minimal: a single Node.js process serves the static frontend and relays WebSocket messages in memory. There is no database, no user accounts, and no message persistence. The server's only job is to relay messages between connected browsers on the same network — and then forget them.

**Design constraints that shaped every decision:**

- Zero friction: no install, no account, open URL and you're in
- Public-by-design: the room is the network, not a secret channel
- Auditable: the entire server fits in one file; anyone can read it
- Ephemeral: closing the tab is the end of your session, with no trace left

---

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│   ┌─────────────┐        ┌──────────────────────────┐  │
│   │  index.html │        │       app.js (client)    │  │
│   │  (static)   │        │  - WebSocket connection  │  │
│   └─────────────┘        │  - textContent rendering │  │
│                          │  - no localStorage/cookie│  │
│                          └────────────┬─────────────┘  │
└───────────────────────────────────────┼─────────────────┘
                                        │ wss://
                                        │ WebSocket (TLS)
                              ┌─────────▼──────────┐
                              │   Node.js Server   │
                              │                    │
                              │  ┌──────────────┐  │
                              │  │  HTTP Server │  │
                              │  │  (static +   │  │
                              │  │   upgrade)   │  │
                              │  └──────┬───────┘  │
                              │         │           │
                              │  ┌──────▼───────┐  │
                              │  │  WebSocket   │  │
                              │  │  Handler     │  │
                              │  │  (ws lib)    │  │
                              │  └──────┬───────┘  │
                              │         │           │
                              │  ┌──────▼───────┐  │
                              │  │  Room        │  │
                              │  │  Registry    │  │
                              │  │  (in-memory) │  │
                              │  └──────────────┘  │
                              └────────────────────┘
```

### Server

A single Node.js process with two responsibilities:

| Responsibility | Implementation |
|---|---|
| Serve static assets | Built-in `http` module — no Express |
| Relay WebSocket messages | `ws` library, `maxPayload: 1024` |

**Room Registry** is a plain `Map<roomId, Set<WebSocket>>`. Room ID is derived from the client's TCP-layer IP. There is no secondary storage. Process restart = all rooms gone.

**Identity Map** is a plain `Map<WebSocket, string>` binding each socket to its server-assigned name for the duration of the connection.

### Client

A single HTML file with inline or co-located JS. No framework, no build step.

- Connects to `wss://trainchat.app` via the browser WebSocket API
- Renders all incoming content via `textContent` — never `innerHTML`
- Holds no state beyond the current session's messages in the DOM
- No cookies, no `localStorage`, no `sessionStorage`

---

## Data Flow

### Connection Establishment

```
Browser                              Server
   │                                    │
   │──── TCP handshake ────────────────▶│
   │◀─── TCP ACK ────────────────────── │
   │                                    │
   │──── HTTP GET /  ──────────────────▶│
   │◀─── 200 OK (index.html) ─────────  │
   │                                    │
   │──── HTTP Upgrade: websocket ──────▶│  ← Origin header checked here
   │     Origin: https://trainchat.app  │
   │                                    │  ← socket.remoteAddress → roomId
   │                                    │  ← random name assigned, bound to socket
   │◀─── 101 Switching Protocols ──────  │
   │                                    │
   │◀─── { type:"joined",              │
   │       name:"Crimson Penguin",      │
   │       roomSize: N }               │
```

### Message Relay

```
Sender                    Server                   Room Peers
  │                          │                         │
  │─── { type:"msg",         │                         │
  │      text:"Hello!" } ──▶│                         │
  │                          │  1. maxPayload check     │
  │                          │     (ws layer, pre-parse)│
  │                          │  2. JSON.parse()         │
  │                          │  3. type === "msg" ?     │
  │                          │  4. text: string?        │
  │                          │     1-500 chars, trimmed │
  │                          │  5. rate limit check     │
  │                          │     (token bucket)       │
  │                          │  6. Construct envelope:  │
  │                          │     JSON.stringify({     │
  │                          │       type: "msg",       │
  │                          │       from: "Crimson     │
  │                          │             Penguin",    │
  │                          │       text: "Hello!",   │
  │                          │       ts: <server time> │
  │                          │     })                   │
  │◀─── broadcast ──────────│────────────────────────▶│
```

### Disconnection

```
Browser                              Server
   │                                    │
   │──── TCP FIN ──────────────────────▶│
   │                                    │  ← close/error/terminate handler fires
   │                                    │  ← socket removed from room Set
   │                                    │  ← per-IP connection counter decremented
   │                                    │  ← if room is now empty: room deleted from Map
   │                                    │  ← broadcast { type:"left", name, roomSize }
```

---

## Room Assignment

### Mechanism

Every connecting WebSocket's room is determined by `socket.remoteAddress` — the TCP-layer IP address assigned by the operating system. This is the only source of truth for room assignment.

```
socket.remoteAddress  →  roomId  →  room membership
"203.0.113.42"        →  "203.0.113.42"  →  Set<WebSocket>
```

All devices behind the same NAT gateway share one public IP egress, so they land in the same room automatically. This is the zero-friction mechanism: same WiFi = same public IP = same room, with no coordination required.

### Proxy Deployment

When the server runs behind a reverse proxy (nginx, Caddy, Cloudflare), the proxy's IP becomes `socket.remoteAddress` — everyone would land in one global room. The correct solution is the **PROXY protocol**, which carries the real client IP at the TCP layer before the HTTP handshake:

```nginx
# nginx config — PROXY protocol passthrough
stream {
  server {
    listen 443 ssl;
    proxy_pass backend;
    proxy_protocol on;
  }
}
```

The Node.js server then reads the real client IP from the PROXY protocol header, not from HTTP headers.

**What is never trusted:** `X-Forwarded-For`, `X-Real-IP`, and all other HTTP-layer IP headers. These are fully client-controllable and are ignored entirely.

### CGNAT Limitation

"Same public IP" does not guarantee physical proximity on all network types:

| Network type | Behaviour |
|---|---|
| Home/office WiFi | ✅ Same IP = same building |
| Train/cafe WiFi | ✅ Same IP = same location |
| Mobile carrier (CGNAT) | ⚠️ Same IP = potentially thousands of users across a region |
| Corporate VPN | ⚠️ Same IP = all employees on that VPN exit node |

This is disclosed in the UI info box on every page load. It is a known design constraint, not a security vulnerability.

---

## Identity System

### Name Assignment

On connection, the server selects a random name from a pool of ~2,500 combinations:

```
adjectives: ["Amber", "Blazing", "Crimson", "Drifting", ...]  (~50)
animals:    ["Badger", "Crane", "Falcon", "Penguin", ...]      (~50)

name = adjectives[random] + " " + animals[random]
→ "Crimson Penguin"
```

If the chosen name is already active in the room, the server picks again until a unique name is found.

### Binding

```
Map<WebSocket, string>

ws_A  →  "Crimson Penguin"
ws_B  →  "Silver Falcon"
ws_C  →  "Drifting Crane"
```

The binding is created before the socket is added to any room and is removed only when the connection closes. **The client never sends a `from` field.** The server injects `from` into every broadcast envelope using its own map — the client's payload is structurally incapable of affecting the sender identity in the relayed message.

---

## Message Lifecycle

### Validation Pipeline (3 layers)

```
Raw bytes from client
        │
        ▼
┌───────────────────────────────┐
│  Layer 1: ws maxPayload       │  enforced at WebSocket.Server constructor
│  maxPayload: 1024 bytes       │  connection closed if exceeded
│  (before any parsing)         │  cannot be bypassed post-parse
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Layer 2: JSON.parse()        │  malformed JSON → connection closed
│                               │  result is a plain JS object
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Layer 3: Field validation    │
│  - type === "msg"             │  unknown types dropped silently
│  - typeof text === "string"   │
│  - text.trim().length 1–500   │
│  - rate limit check           │  token bucket, 5 msg/sec per socket
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Envelope construction        │
│  JSON.stringify({             │  NEVER string interpolation
│    type: "msg",               │
│    from: identityMap.get(ws), │  server-assigned, not client-supplied
│    text: validated.text,      │  re-serialized clean string
│    ts: Date.now()             │  server timestamp
│  })                           │
└───────────────┬───────────────┘
                │
                ▼
        Broadcast to room
```

### Why JSON.stringify is mandatory

String interpolation for JSON construction is a common developer shortcut that introduces JSON injection:

```js
// WRONG — never do this
const msg = `{"from":"${name}","text":"${text}"}`;
// A text value of: hello","injected":"field
// produces: {"from":"X","text":"hello","injected":"field"}

// CORRECT — always
const msg = JSON.stringify({ from: name, text });
```

The spec mandates `JSON.stringify` at every outbound serialization point.

---

## Security Architecture

### Threat Model

TrainChat's threat model is unusual: **the room is intentionally public to the local network**. The security goals are not to restrict who can join, but to:

1. Prevent one user from harming others in the room (XSS, impersonation)
2. Prevent cross-site attacks from malicious third-party pages
3. Prevent the server from being used as an amplifier or taken down
4. Ensure the server holds no recoverable message data

### Controls

#### XSS Prevention

| Layer | Control |
|---|---|
| Server | `text` validated as plain string, re-serialized via `JSON.stringify` |
| Client | All content rendered via `textContent` — never `innerHTML` |
| Transport | Full Content-Security-Policy header (see below) |

**Content-Security-Policy:**
```
default-src 'self';
script-src  'self';
style-src   'self';
connect-src 'self' wss://trainchat.app;
frame-ancestors 'none';
form-action 'none';
base-uri    'none'
```

- `frame-ancestors 'none'` — TrainChat cannot be embedded in an iframe (prevents clickjacking and silent network membership oracles)
- `connect-src` — outbound WebSocket/fetch restricted to same origin only
- `form-action 'none'` — no form submissions can bypass the no-storage design
- `base-uri 'none'` — prevents base tag injection

**HSTS:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

#### Anti-Impersonation

The server maintains a `Map<WebSocket, string>` binding each connection to its assigned name. Client payloads contain only `{ type, text }`. The `from` field is injected server-side from this map — the client has no mechanism to influence it.

#### Origin Validation

On every WebSocket upgrade request, the server checks the `Origin` header against an allowlist:

- `https://trainchat.app`
- `http://localhost:3000` (development only)

Connections from disallowed origins are rejected with HTTP 403.

**Scope and limitation:** This prevents cross-site WebSocket hijacking from browser contexts — a malicious page at `evil.com` cannot silently connect to TrainChat on behalf of a visiting user. It does **not** prevent direct connections from non-browser clients (`wscat`, `curl`, Python scripts), which either omit `Origin` or set it freely. This is accepted: the chat is public to the local network by design, and this is disclosed to users.

#### Input Validation (3 layers)

See [Message Lifecycle](#message-lifecycle) above. Key point: `maxPayload` is set at the `WebSocket.Server` constructor level, enforced before JSON parsing. This prevents large-payload attacks from consuming CPU in `JSON.parse`.

#### Rate Limiting

| Limit | Value | Rationale |
|---|---|---|
| Messages per second per connection | 5 | Token bucket per socket |
| Max connections per IP | 5 | Effective rate = 25 msg/sec per IP |
| Max payload bytes | 1024 | Enforced at ws layer pre-parse |

Excess messages are dropped silently. No error response is sent (avoids feedback loops).

**Slow-loris mitigation:** The HTTP server sets `headersTimeout` and `requestTimeout` to prevent attackers from holding WebSocket upgrade connections open indefinitely by sending headers byte-by-byte.

#### Connection State Management

The sequence for every new connection:

```js
// Handlers registered BEFORE socket is added to any map
ws.on('close',     () => cleanup(ws));
ws.on('error',     () => cleanup(ws));
ws.on('terminate', () => cleanup(ws));

// Only now add to room and identity maps
identityMap.set(ws, assignedName);
rooms.get(roomId).add(ws);
```

`cleanup(ws)` removes the socket from the room set, decrements the per-IP connection counter, deletes the identity map entry, and removes the room from the registry if it becomes empty.

#### Operational Privacy

Messages are ephemeral at the application level, but the process heap holds messages briefly. Mitigations:

| Risk | Mitigation |
|---|---|
| Core dump exposes heap | `ulimit -c 0` in process supervisor config |
| Debug logging captures messages | No `console.log` of message content anywhere in codebase |
| V8 heap snapshot | `--inspect` flag not set in production startup |
| Stale sockets in room map | Empty rooms deleted immediately on last disconnect |
| Log files from pm2/systemd stdout | Process supervisor configured to not capture message content |

---

## Known Limitations

| Limitation | Impact | Status |
|---|---|---|
| CGNAT: same public IP ≠ same physical location | Users on mobile carriers or hotel WiFi may share a room with geographically distant strangers | Disclosed in UI; future: opt-in QR room codes |
| Non-browser clients can connect | Scripts and tools can read all room messages | By design; chat is public to the network; disclosed in UI |
| In-memory relay: messages briefly in server heap | Crash dump could theoretically expose messages | Mitigated: core dumps disabled, no message logging |
| Single-process server | Process crash ends all rooms globally | Mitigated by process supervisor auto-restart; rooms are ephemeral by design |
| IP-based room has no sub-grouping | Large shared networks (airports, universities) put all users in one room | Future: opt-in named rooms or QR codes |

---

## Deployment

### Requirements

- Node.js LTS
- Domain with DNS pointing to server
- TLS certificate (Let's Encrypt / certbot) — required for `wss://`
- Any VPS with a public IP ($5/month is sufficient)

### Process Supervision

```ini
# systemd example
[Service]
ExecStart=/usr/bin/node /opt/trainchat/src/server.js
LimitCORE=0          # disable core dumps
Restart=always
StandardOutput=null  # do not capture stdout (prevents message logging)
StandardError=journal
```

### Reverse Proxy (nginx with PROXY protocol)

```nginx
stream {
  upstream trainchat_backend {
    server 127.0.0.1:3000;
  }
  server {
    listen 443 ssl;
    ssl_certificate     /etc/letsencrypt/live/trainchat.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trainchat.app/privkey.pem;
    proxy_pass trainchat_backend;
    proxy_protocol on;   # passes real client IP at TCP layer
  }
}
```

The Node.js server reads the real client IP from the PROXY protocol header, not from `X-Forwarded-For`.

### Self-Hosting (Quick Start)

```bash
git clone https://github.com/agent-knopf/trainchat
cd trainchat
npm install
npm start
```

For production, configure TLS and a process supervisor as above.

---

## Future Roadmap

| Feature | Motivation | Notes |
|---|---|---|
| WebRTC upgrade | Messages never touch the server (true P2P) | Server becomes signaling-only; much stronger privacy |
| QR-code room codes | Opt-in sub-grouping, addresses CGNAT | User scans QR at venue; code is shared secret for room ID |
| File/image sharing | Common use case on local networks | WebRTC data channels; P2P preferred |
| Emoji reactions | Low-effort social signal | Additive to message envelope |
| Mobile-optimised UI | Most users on phones | CSS only, no new architecture |
| Abuse reporting | Signal bad actors to room | Ephemeral flag system; no persistence needed |
