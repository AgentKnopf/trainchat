# TrainChat — Design Spec
**Date:** 2026-09-18
**Status:** Draft — v2 (post adversarial review)

---

## 1. Overview

TrainChat is a zero-install, browser-based ephemeral chat app for people on the same local network. Open a URL, get a random identity, start chatting with whoever is nearby. No accounts, no history, no data retention. When you close the tab, you're gone.

**Core value:** The network IS the room. Two people on the same train WiFi are automatically in the same chat — no coordination needed.

---

## 2. Goals & Non-Goals

### Goals
- Zero friction: open URL → instantly in the room
- Fully anonymous: random adjective+animal identity (e.g. "Crimson Penguin")
- Ephemeral: messages live in the browser tab only, gone on close
- Trustworthy: fully open source, transparent architecture, no hidden data collection
- Secure by design: adversarial input treated as the default

### Non-Goals (MVP)
- File or image sharing
- Emoji reactions
- Persistent identities or accounts
- Message history across sessions
- Private rooms or direct messages
- Mobile app

---

## 3. Architecture

### 3.1 Components

```
Browser (Client)
    │  WebSocket (wss://)
    ▼
Node.js Server (trainchat.app)
    ├── WebSocket handler (ws library, maxPayload: 1024)
    ├── Static file server (HTML/CSS/JS)
    └── In-memory room registry (Map<roomId, Set<socket>>)
```

**Single server, two responsibilities:**
1. Serve the static frontend (HTML/JS/CSS)
2. WebSocket relay — receive messages, reconstruct envelope, broadcast to room peers

No database. No message storage. No session storage. Server restart = all rooms gone.

### 3.2 Room Assignment

Rooms are determined by the client's **TCP-layer IP address** (`socket.remoteAddress`) — never from HTTP headers.

- Same public IP egress → same room
- This naturally maps to "same WiFi network" (all devices on a network share one public IP)
- No user choice, no room codes — fully automatic

**Known limitation — CGNAT & shared infrastructure:**
`socket.remoteAddress` does not guarantee physical proximity. Users behind Carrier-Grade NAT (mobile carriers, hotels, some ISPs), shared corporate VPNs, or shared office NAT may land in the same room despite being geographically dispersed. This is a fundamental constraint of IP-based room assignment and is disclosed to users in the info box. It does not represent a security vulnerability — it is a transparency and privacy expectation issue. Future versions may address this via optional QR-code room codes.

**Proxy note:** If deployed behind a reverse proxy (nginx, Cloudflare, etc.), use PROXY protocol (`proxy_protocol on` in nginx) so `remoteAddress` reflects the real client IP at the TCP layer. The application **never** reads `X-Forwarded-For` or `X-Real-IP` from HTTP headers — these are client-controllable and untrusted.

### 3.3 Identity System

- Server assigns a random `adjective + animal` name at connection time
- Name pool: ~50 adjectives × ~50 animals = 2,500 combinations
- Name is bound to `socket.id` server-side — immutable for the lifetime of the connection
- No client can claim, change, or spoof a name
- On collision (same name already in room): server picks a new combination automatically

---

## 4. Message Flow

```
1. Client connects via WebSocket
2. Server validates Origin header — reject if not in allowlist (browser clients)
   Non-browser clients (no Origin header) are also accepted — Origin is CSRF
   prevention only, not authentication (see §5.4)
3. Server resolves room from socket.remoteAddress (TCP only)
4. Server assigns random name, binds to socket.id
5. Server sends JOIN confirmation: { type: "joined", name: "Crimson Penguin", roomSize: N }

Per message:
6. Client sends:  { type: "msg", text: "Hello!" }
7. Server validates:
   - Raw payload size enforced at ws layer (maxPayload: 1024 bytes)
   - JSON parsed after size check
   - type === "msg" (unknown types dropped silently)
   - text is a string, 1–500 characters, non-empty after trim
   - rate limit: max 5 messages/second per connection (token bucket)
8. Server constructs envelope using JSON.stringify only — never string interpolation:
   JSON.stringify({ type: "msg", from: socketMap.get(ws), text: msg.text, ts: Date.now() })
9. Server broadcasts envelope to all sockets in room (including sender)

Client receives envelope:
10. Renders msg.from via textContent
11. Renders msg.text via textContent (never innerHTML)
```

**Critical invariants:**
- The server never passes any client-supplied field through to the broadcast envelope
- Every outbound envelope is constructed via `JSON.stringify` — never string interpolation
- `maxPayload` is set on the `WebSocket.Server` constructor, not checked post-parse
- All socket close/error/terminate events decrement the per-IP connection counter

---

## 5. Security Design

### 5.1 XSS Prevention
- **Server:** `text` field validated as plain string, length-capped, always serialized via `JSON.stringify`
- **Client:** All message content rendered exclusively via `textContent` — never `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`
- **CSP header (full):**
  ```
  Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self';
    connect-src 'self' wss://trainchat.app;
    frame-ancestors 'none';
    form-action 'none';
    base-uri 'none'
  ```
- **HSTS header:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- No markdown, no HTML, no rich text in MVP — plain text only

### 5.2 Identity Binding (Anti-Impersonation)
- Names assigned server-side at connection time, stored in `Map<WebSocket, string>`
- Client payloads contain only `{ type, text }` — no `from` field accepted
- Server injects `from` from its own map before broadcasting
- Messages with unexpected fields are rejected (strict schema validation)

### 5.3 Room Grouping — IP Trust Model
- Room ID derived solely from `socket.remoteAddress` (TCP connection, OS-level)
- `X-Forwarded-For`, `X-Real-IP`, and all IP-related headers **ignored**
- If behind a reverse proxy: PROXY protocol only (see §3.2)
- CGNAT limitation acknowledged and disclosed to users (see §3.2 and §6.2)

### 5.4 WebSocket Origin Validation
- Server checks `Origin` header on WebSocket upgrade requests
- Allowlist: `https://trainchat.app`, `http://localhost:3000` (dev only)
- Connections from disallowed origins rejected with HTTP 403
- **Scope:** This prevents cross-site WebSocket hijacking from browsers only
- **Explicit non-guarantee:** Non-browser clients (scripts, wscat, curl) send no `Origin` or spoof it freely. Origin validation is a CSRF prevention mechanism — it is **not** authentication. Anyone on the network with a script can connect and read messages. This is by design: the chat is public to the local network. The info box discloses this to users.

### 5.5 Input Validation
- **Layer 1 (ws constructor):** `maxPayload: 1024` — connection closed if exceeded, before JSON parse
- **Layer 2 (post-parse):** type must be `"msg"`, text must be string, 1–500 chars, trimmed
- **Layer 3 (serialization):** outbound envelope always via `JSON.stringify` — no string interpolation
- Malformed JSON closes the connection immediately
- Unknown message types dropped silently (no error feedback to attacker)

### 5.6 Rate Limiting
- Max 5 messages per second **per connection** (token bucket per socket)
- Max connections **per IP: 5** (not 10 — effective rate = 5×5 = 25 msg/sec per IP, acceptable)
- Connection counter decremented on `close`, `error`, AND `terminate` events to prevent leak
- `headersTimeout: 10000` and `requestTimeout: 10000` set on the HTTP server to mitigate slow-loris on WebSocket upgrade phase
- Excess messages dropped silently

### 5.7 Operational Privacy (No-Persistence Guarantees)
- No `console.log` of message content anywhere in the codebase — enforced by code review
- Core dumps disabled in production (`ulimit -c 0` in the process supervisor config)
- No V8 inspector or heap snapshot flags in production startup command
- Room cleanup: on socket `close`/`error`/`terminate`, socket removed from room map immediately
- Empty rooms deleted from the registry immediately (no stale entries)
- Node.js process supervisor (systemd/pm2) configured with no stdout log capture of message content

### 5.8 Connection State Management
- Every WebSocket instance registers `close`, `error`, and `terminate` handlers before being added to any room map
- Handler removes socket from room map and decrements per-IP counter
- Unhandled exceptions in message handlers caught at the top level — connection closed gracefully, room map updated

---

## 6. Frontend Design

### 6.1 UI (MVP)
- Single page, no routing
- Header: app name + "You are: Crimson Penguin" + room size ("3 people here")
- Message list: scrollable, newest at bottom
- Input: single text field + send button
- Info box: explanation of how it works + link to GitHub

### 6.2 Info Box Content (Trust Layer)
```
How TrainChat works:
• Your messages are relayed to everyone on the same WiFi network
• "Same network" means same public IP — this includes everyone behind
  shared WiFi, hotel networks, or carrier-grade NAT (not just your train car)
• Nothing is stored — messages exist only in connected browser tabs
• Anyone on this network can connect, including via scripts or tools
• This server is fully open source: github.com/[username]/trainchat
• Closing this tab ends your session permanently
```

### 6.3 Client Security Rules
- No external scripts, fonts, or assets (all self-hosted)
- No cookies, no localStorage, no sessionStorage
- No analytics, no tracking pixels
- WebSocket connection only to `wss://trainchat.app` (enforced by CSP `connect-src`)
- TrainChat cannot be embedded in an iframe (enforced by CSP `frame-ancestors 'none'`)

---

## 7. Server Tech Stack

- **Runtime:** Node.js LTS
- **WebSocket:** `ws` library (minimal, auditable) — `maxPayload: 1024` set at constructor
- **Static serving:** built-in `http` module — no Express needed for MVP
- **Hosting:** Any VPS ($5/month) — no managed services, no vendor lock-in
- **TLS:** Let's Encrypt via certbot (required for `wss://`)
- **Process supervisor:** systemd or pm2 — with `ulimit -c 0`, no stdout message logging

---

## 8. Open Source & Transparency

- Full source on GitHub (MIT license)
- README explains architecture, data flow, CGNAT limitation, and what the server does/doesn't store
- No telemetry, no analytics, no third-party dependencies in frontend
- Reproducible: anyone can self-host from the repo in under 10 minutes

---

## 9. Known Limitations & Accepted Risks

| Limitation | Impact | Mitigation |
|---|---|---|
| CGNAT: same IP ≠ same physical network | Users may share room with strangers from other locations | Disclosed in info box; future: opt-in room codes |
| Non-browser clients can connect freely | Scripts can read all room messages | By design — chat is public to network; disclosed to users |
| IP-based room = no authentication | Anyone on network is in the room | By design — zero friction is the product |
| In-memory relay: server process holds messages briefly | Heap snapshot or crash dump could expose messages | Core dumps disabled; no message logging |

---

## 10. Out of Scope (Future)

- WebRTC upgrade (P2P, messages never touch server)
- Optional QR-code room codes (sub-network grouping, addresses CGNAT)
- File/image sharing
- Emoji reactions
- Persistent identities or accounts
- PWA / offline support
- Mobile-optimized UI
- Abuse reporting

---

## 11. Success Criteria (MVP)

- Two people on the same WiFi can chat within 5 seconds of opening the URL
- Zero setup required on either device
- Server codebase fits in a single auditable file
- All security findings from both review rounds addressed by design
- CGNAT limitation clearly disclosed to users
