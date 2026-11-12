# CollabSpace Vercel Hybrid Deployment Guide

This guide describes how to deploy CollabSpace using **Vercel** for the Next.js 16 web application and API routes, paired with a dedicated long-running WebSocket service for real-time Yjs CRDT document synchronization.

---

## 1. Architectural Architecture: The Hybrid Model

CollabSpace delivers low-latency collaborative document editing, real-time presence awareness, version history, comments, and five-tier RBAC.

```
                          ┌───────────────────────────────────────────────┐
                          │             Client Browser                    │
                          │   (TipTap Editor + Yjs WebsocketProvider)     │
                          └──────┬─────────────────────────────────┬──────┘
                                 │ HTTP (Pages & REST APIs)        │ WSS (Binary Yjs Protocol)
                                 ▼                                 ▼
         ┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
         │     Vercel Serverless Platform       │  │ Dedicated WebSocket Collaboration    │
         │          (Next.js 16)                │  │    (Render / Railway / Fly.io / VPS) │
         │                                      │  │                                      │
         │ - React 19 Server Components         │  │ - Persistent in-memory Y.Doc cache   │
         │ - Authentication & Session Cookies   │  │ - Real-time CRDT differential sync   │
         │ - Workspace & Document CRUD APIs     │  │ - Awareness & presence broadcasting  │
         │ - Comment CRUD & Event Publishing    │  │ - Debounced PostgreSQL snapshots     │
         └──────────────────┬───────────────────┘  └──────────────────┬───────────────────┘
                            │                                         │
                            │ Pooled SQL                              │ Pooled SQL
                            ▼                                         ▼
         ┌────────────────────────────────────────────────────────────────────────────────┐
         │                    Neon Serverless PostgreSQL 17                               │
         │               (Connection Pooler via PgBouncer / Prisma 7)                     │
         └──────────────────────────────────────┬─────────────────────────────────────────┘
                                                │
                                                │ TLS Pub/Sub (`rediss://`)
                                                ▼
         ┌────────────────────────────────────────────────────────────────────────────────┐
         │                    Upstash Redis (Serverless TLS)                              │
         │          (Cross-Instance Pub/Sub & Comment Real-Time Broadcasting)             │
         └────────────────────────────────────────────────────────────────────────────────┘
```

### Why Pure Serverless Cannot Host the Collaboration Server

| Requirement | Vercel Serverless Functions | Dedicated WebSocket Host |
| :--- | :--- | :--- |
| **Connection Lifetime** | Max 300s execution timeout (disconnects active editors) | Indefinite persistent TCP/WebSocket connections |
| **Shared CRDT State** | Ephemeral, isolated containers cause **split-brain** desync | In-memory `WSSharedDoc` synchronized across all peers |
| **Debounced Writes** | Event loop pauses immediately on HTTP response | Active timers reliably flush binary snapshots to Postgres |
| **Pub/Sub Subscriber** | Cannot maintain long-lived TCP socket subscriptions | Continuous Redis subscriber for cross-instance sync |

---

## 2. Prerequisites & Accounts

1. **GitHub Account**: Access to `https://github.com/Amruth4146/CollabSpace.git`.
2. **Vercel Account**: [vercel.com](https://vercel.com).
3. **Neon PostgreSQL Account**: [neon.tech](https://neon.tech) (Free tier provides 0.5 GiB storage and connection pooling).
4. **Upstash Redis Account**: [upstash.com](https://upstash.com) (Free tier provides 10,000 commands/day with native TLS `rediss://`).
5. **WebSocket Host Account**: Render, Railway, Fly.io, or any VPS/container host with persistent execution.

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Provision Neon PostgreSQL

1. Log in to [Neon Console](https://console.neon.tech/) and create a project named `collabspace`.
2. In the Neon Dashboard, locate the connection details:
   - Check **Connection Pooling** to get the pooled connection string:
     ```
     DATABASE_URL="postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/neondb?sslmode=require"
     ```
   - Uncheck Connection Pooling to get the direct connection string:
     ```
     DIRECT_URL="postgresql://[user]:[password]@[endpoint].[region].aws.neon.tech/neondb?sslmode=require"
     ```
3. Run the schema migrations against Neon from your local development terminal:
   ```bash
   npx prisma migrate deploy
   ```

---

### Step 2: Provision Upstash Redis

1. Log in to [Upstash Console](https://console.upstash.com/) and create a Redis database named `collabspace-redis`.
2. Select your preferred primary region (choose one close to your Neon database and WebSocket host).
3. Copy the **Node.js (ioredis)** connection string starting with `rediss://`:
   ```
   REDIS_URL="rediss://default:[password]@[endpoint].upstash.io:6379"
   ```

---

### Step 3: Deploy Dedicated WebSocket Server

Deploy `server/collab-server.ts` to Render, Railway, Fly.io, or a VPS.

#### Example: Deploying on Render
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository `https://github.com/Amruth4146/CollabSpace.git`.
3. Configure settings:
   - **Name**: `collabspace-collab`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start:collab`
4. Add Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `DATABASE_URL`: Your Neon pooled connection string (`?sslmode=require`)
   - `REDIS_URL`: Your Upstash Redis TLS connection string (`rediss://...`)
   - `NEXT_PUBLIC_APP_URL`: `https://collabspace.vercel.app` (your Vercel production domain)
   - `ALLOWED_ORIGINS`: `https://collabspace.vercel.app,collabspace-*.vercel.app` (exact domain + project-scoped preview pattern)
   - `COLLAB_WS_TOKEN_SECRET`: 256-bit shared signing secret (`openssl rand -hex 32`, must match Vercel)
5. Click **Create Web Service**.
6. Verify deployment by checking the health check in your browser:
   ```
   https://collabspace-collab.onrender.com/health
   ```
   Expected response:
   ```json
   {"status":"ok","activeDocuments":0,"timestamp":"..."}
   ```

---

### Step 4: Deploy Next.js Web App on Vercel

1. Log in to [Vercel Dashboard](https://vercel.com) and click **Add New...** -> **Project**.
2. Import the `CollabSpace` repository.
3. Configure the project:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`
4. Add the following **Environment Variables** (apply to *Production*, *Preview*, and *Development*):

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production mode |
| `DATABASE_URL` | `postgresql://...-pooler...neon.tech/neondb?sslmode=require` | Neon pooled connection string |
| `DIRECT_URL` | `postgresql://......neon.tech/neondb?sslmode=require` | Neon direct connection string (for migrations) |
| `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | Upstash Redis connection string |
| `NEXT_PUBLIC_APP_URL` | `https://collabspace.vercel.app` | Production Vercel domain (inlined at build) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | `wss://collabspace-collab.onrender.com` | Dedicated WebSocket service URL (inlined at build) |
| `COLLAB_WS_TOKEN_SECRET` | `<generate-with-openssl-rand-hex-32>` | Server-side 256-bit secret for signing HMAC-SHA256 collaboration tickets (must match WebSocket service) |

5. Click **Deploy**. Vercel will build the Next.js production bundle and deploy globally.

---

### Step 5: Shared Secret & Origin Configuration Deep-Dive

#### 1. Collaboration Token Secret (`COLLAB_WS_TOKEN_SECRET`)
- **Required Services**: Both the **Next.js Web Application** (Vercel) and the **WebSocket Collaboration Server** (Render/Railway).
- **Exact Parity**: Both services **MUST** be configured with the identical secret string.
- **Generation**: Must be generated using high-entropy 256-bit random bytes:
  ```bash
  openssl rand -hex 32
  ```
- **Secret Isolation**:
  - `COLLAB_WS_TOKEN_SECRET` is strictly a server-side secret.
  - **NEVER** prefix it with `NEXT_PUBLIC_` or reference it in browser-side code.
  - Next.js will not bundle it into client JavaScript.
- **Fail-Safe Behavior**:
  - In production (`NODE_ENV === 'production'`), if `COLLAB_WS_TOKEN_SECRET` is missing, `getCollabTokenSecret()` throws an immediate fatal error and refuses to issue or verify tickets.
  - Development environments fall back to a hardcoded non-production key if not set.

#### 2. Origin Validation & Wildcard Rules (`ALLOWED_ORIGINS`)
The WebSocket Collaboration Server (`server/collab-server.ts`) inspects incoming `Origin` headers before accepting connections:
- **Bare Multi-Tenant Wildcards are REJECTED**:
  Broad patterns on shared public cloud domains (e.g. `*.vercel.app`, `*.onrender.com`, `*.railway.app`, `*.fly.dev`) are **actively blocked** by the server's `isWildcardPatternSafe` filter. Anyone can deploy an application to `*.vercel.app`, so bare wildcards permit any third-party Vercel app to connect to your real-time rooms.
- **Project-Scoped Wildcards are PERMITTED**:
  Patterns that include your project name prefix (e.g., `collabspace-*.vercel.app`) are validated with strict regex anchors (`^collabspace-[a-z0-9_-]+\.vercel\.app$`), allowing legitimate Vercel git-branch preview deployments while blocking other Vercel users.
- **Origin Validation Matrix**:
  | Origin Header | Configured Pattern | Decision | Reason |
  | :--- | :--- | :---: | :--- |
  | `https://collabspace.vercel.app` | `NEXT_PUBLIC_APP_URL` | **ALLOWED** | Exact match with production domain |
  | `https://collabspace-git-feature-123.vercel.app` | `collabspace-*.vercel.app` | **ALLOWED** | Matches project-scoped wildcard pattern |
  | `https://unrelated-project.vercel.app` | `collabspace-*.vercel.app` | **REJECTED** | Does not match `collabspace-` prefix |
  | `https://attacker.vercel.app` | `*.vercel.app` | **REJECTED** | Bare wildcard rejected as insecure by server |
  | Missing `Origin` header | N/A (CLI / backend tools) | **ALLOWED** | Allowed for non-browser scripts; protected by mandatory HMAC ticket |

---

## 4. Cross-Domain Authentication & Security Architecture

CollabSpace utilizes a document-scoped, short-lived HMAC-SHA256 collaboration ticket architecture:

```
1. User logs in at https://collabspace.vercel.app
   │
   ├─► Next.js sets HttpOnly cookie: `collabspace_session=<sessionToken>` (SameSite: 'Lax', Secure: true)
   │
2. User opens /editor/[id]
   │
   ├─► Browser sends POST /api/documents/[id]/collab-token with HttpOnly cookie
   │
   ├─► Next.js verifies session, checks 5-tier document RBAC (viewer/editor/admin/owner),
   │   generates single-use HMAC-SHA256 signed ticket with 60s TTL, and returns:
   │   {
   │     ticket: "collab_ticket:<payloadB64>.<hmacSignature>",
   │     expiresInSeconds: 60,
   │     permissions: { canWrite: true, canComment: true }
   │   }
   │
3. TipTap Editor initiates WebSocket connection:
   │
   ├─► `wss://collabspace-collab.onrender.com/collaboration/[id]?token=collab_ticket:...`
   │
4. WebSocket Collaboration Server validates handshake:
   │
   ├─► Step A (Origin Check): Verifies `Origin` against `ALLOWED_ORIGINS` (project-scoped only)
   ├─► Step B (Format Check): Strictly rejects raw session tokens in production (code 4401)
   ├─► Step C (HMAC Check): Verifies cryptographic signature with COLLAB_WS_TOKEN_SECRET (constant time)
   ├─► Step D (Scope Check): Verifies documentId matches room and ticket is within 60s TTL
   ├─► Step E (Replay Check): Atomically consumes ticket in Redis via SET collab:consumed_ticket:<hash> 1 EX 60 NX
   ├─► Step F (RBAC Check): Verifies user role and binds canWrite permissions (read-only for viewers/commenters)
   └─► Step G (Room Join): Hydrates Y.Doc from PostgreSQL and syncs CRDT state
   │
5. In-Band Ticket Renewal (every 45s while editing):
   │
   ├─► Editor calls POST /api/documents/[id]/collab-token to get fresh 60s ticket
   ├─► Sends in-band `messageAuth` packet over existing open WebSocket
   ├─► Server verifies same-user identity (`reauthResult.user.id === context.userId`)
   └─► Reauthorizes connection seamlessly without dropping the WebSocket connection
```

### Security Highlights
- **Zero Raw Tokens in URLs**: Long-lived session cookies never appear in WebSocket URLs, eliminating token leakage in reverse proxy logs, browser histories, and error trackers.
- **Single-Use Replay Protection**: Redis atomically prevents tickets from being reused across multiple initial connections.
- **Identity Binding**: In-band ticket renewals must match the authenticated socket's user ID, preventing cross-user session spoofing.
- **Instant Revocation & Fail-Closed Defense**: When documents are soft-deleted or permanently deleted, or member roles change, Redis pub/sub (`collab:revoke`) immediately closes unauthorized sockets or downgrades write permissions in real time.
- **Read-Only Wire Protection**: Viewers and commenters cannot inject Yjs mutation packets (`messageYjsUpdate`); unauthorized mutations are intercepted and rejected with `Permission denied`.

---

## 5. Post-Deployment Verification Checklist

- [ ] **Health Check**: Open `https://<collab-host>/health` -> Verify status `ok`.
- [ ] **Registration & Login**: Create a new account on the Vercel app.
- [ ] **Document Creation**: Create a new document in a workspace.
- [ ] **Multi-User Collaboration**:
  - Open the document in two separate browser windows (or incognito).
  - Verify that typing in Window A updates in Window B in real time with < 100ms latency.
  - Verify that presence carets and user name badges appear accurately.
- [ ] **Comments Synchronization**:
  - Add a comment in Window A.
  - Verify the comment appears in Window B via Redis Pub/Sub broadcast.
- [ ] **Persistence Durability**:
  - Make edits and wait 5 seconds.
  - Refresh the page and verify that content persists from PostgreSQL.
- [ ] **Version History**:
  - Create a version snapshot under History.
  - Verify that version snapshots can be previewed and restored safely.

