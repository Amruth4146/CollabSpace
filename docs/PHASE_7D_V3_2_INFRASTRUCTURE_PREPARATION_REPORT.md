# Phase 7D-V3.2: Cloud Infrastructure Preparation Report

**Project:** CollabSpace  
**Root Directory:** `D:\collabspace`  
**Git Repository:** `https://github.com/Amruth4146/CollabSpace.git`  
**Current Branch:** `master`  
**Verified Baseline Commit:** `3d6774c3815a1213e7d402b23a9ca8c43548a535`  
**Preparation Date:** November 11, 2026  
**Roles:** Senior DevOps Engineer and Cloud Deployment Architect  
**Objective:** Complete cloud infrastructure specification and dashboard runbooks for CollabSpace production deployment  

---

## 1. Executive Summary & Current Project State

This report establishes the complete, production-ready cloud infrastructure plan for deploying CollabSpace across its hybrid cloud topology:
- **Frontend & REST APIs:** Vercel (Next.js 16.4.2 App Router, React 19, TypeScript)
- **Real-Time Collaboration Service:** Render (Persistent Node.js WebSocket service running `server/collab-server.ts`)
- **Relational Persistence:** Neon (Serverless PostgreSQL 17 with connection pooling)
- **Pub/Sub & Single-Use Replay Protection:** Upstash (Serverless Redis with native TLS)

### Current Verified Repository State
- **Branch:** `master`
- **HEAD Commit:** `3d6774c3815a1213e7d402b23a9ca8c43548a535` (unmodified).
- **Working Tree:** 9 tracked modified files and 15 untracked files/directories cleanly preserved.
- **Environment Isolation:** `.env` and `.env*` files remain strictly ignored by `.gitignore:39`. Zero credentials or secret values are tracked or exposed.
- **Local Infrastructure:** Local PostgreSQL and Redis Docker containers remain intact and undisturbed.
- **Safety Compliance:** Zero cloud resources have been created, zero database migrations have been executed, and no deployments have been initiated.

---

## 2. Architecture & Source-Code Verification

Every component of the deployment specification has been reconciled against the actual codebase:

```
+-----------------------------------------------------------------------------------+
|                           PRODUCTION TOPOLOGY ARCHITECTURE                        |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [ End-User Browser ]                                                             |
|       │                                                                           |
|       ├── HTTPS (Next.js App / REST APIs) ────────► [ Vercel Serverless ]         |
|       │                                                    │                      |
|       │                                             Prisma Client                 |
|       │                                            (Port 6543 Pool)               |
|       │                                                    │                      |
|       └── WSS (Real-Time Yjs Collaboration) ──────► [ Render Web Service ]        |
|                                                     (server/collab-server.ts)     |
|                                                            │                      |
|                     ┌──────────────────────────────────────┴──────────────┐       |
|                     ▼                                                     ▼       |
|           [ Neon PostgreSQL 17 ]                               [ Upstash Redis ]  |
|      - Pooled Port 6543 (Runtime App/Collab)            - rediss:// (TLS Port 6379|
|      - Direct Port 5432 (Prisma Migrations)             - collab:revoke Pub/Sub   |
|                                                         - Atomic Replay Protection|
+-----------------------------------------------------------------------------------+
```

### Verified Codebase Directives
1. **Frontend Start & Build:**
   - Build: `npm run build` (`next build` with Turbopack).
   - Start: `npm run start` (`next start`).
   - Verified in `package.json#L7-L8`.
2. **WebSocket Collaboration Server:**
   - Start Command: `npm run start:collab` (`tsx server/collab-server.ts`).
   - Runner: `tsx` is listed in `dependencies` (`package.json#L47`), ensuring it is installed on Render even when `NODE_ENV=production` omits devDependencies.
   - Host Interface: Automatically binds to `0.0.0.0` when `NODE_ENV=production` or `PORT` is defined ([`collab-server.ts#L1354-L1357`](file:///d:/collabspace/server/collab-server.ts#L1354-L1357)).
   - Port Handling: Dynamically resolves `process.env.PORT` (assigned by Render) with fallback to `1234`.
   - Health Check: Responds to `GET /health` with `HTTP 200 OK` and payload `{"status":"ok","activeDocuments":0,"timestamp":"..."}`.
3. **Database Client Decoupling:**
   - Runtime Client: `src/lib/prisma.ts` uses `@prisma/adapter-pg` with `DATABASE_URL` (Neon pooled endpoint on port 6543 with `?sslmode=require`).
   - Migration CLI: `prisma.config.ts` uses `DIRECT_URL` (Neon unpooled direct endpoint on port 5432) required for session-level DDL advisory locks.
4. **WebSocket Authentication & Replay Protection:**
   - Both Vercel API and Render WebSocket server share `COLLAB_WS_TOKEN_SECRET` to issue and verify 60-second HMAC-SHA256 tickets.
   - Initial connections atomically consume tickets in Redis via `SET collab:consumed_ticket:<sha256> 1 EX 60 NX`.
   - In-band renewal validates that renewed tickets match the active socket's authenticated `context.userId`.
5. **Origin Verification:**
   - `server/collab-server.ts#isOriginAllowed()` accepts `NEXT_PUBLIC_APP_URL` and project-scoped wildcards like `collabspace-*.vercel.app`, while strictly rejecting bare multi-tenant public suffixes (`*.vercel.app`).

---

## 3. Render Preparation (Dedicated WebSocket Service)

Render will host the persistent stateful Node.js WebSocket process.

### Service Configuration Specifications
- **Service Type:** Web Service
- **Service Name:** `collabspace-collab`
- **Repository:** `https://github.com/Amruth4146/CollabSpace.git`
- **Branch:** `master`
- **Root Directory:** `./` (repository root)
- **Runtime Environment:** `Node` (Node.js 20 or 22 LTS)
- **Region:** Ohio (US East) or Oregon (US West) — *Match Neon & Upstash region*
- **Instance Plan:**
  - *Starter ($7/mo)*: **Highly Recommended** for production. Guarantees 24/7 uptime without sleep intervals.
  - *Free Tier*: Allowed for testing, but spins down after 15 minutes of inactivity, causing a 30–50 second cold-start delay on first connection.
- **Build Command:**
  ```bash
  npm install
  ```
- **Start Command:**
  ```bash
  npm run start:collab
  ```
- **Health Check Path:**
  ```
  /health
  ```
- **Auto-Deploy:** Enabled (triggers on new pushes to `master`)

### Render Environment Variables
| Variable Name | Value / Source | Description |
|:---|:---|:---|
| `NODE_ENV` | `production` | Enables production security and strict token enforcement |
| `DATABASE_URL` | Neon Pooled Connection String | PostgreSQL connection string (`postgresql://...-pooler...neon.tech/neondb?sslmode=require`) |
| `REDIS_URL` | Upstash TLS Connection String | Redis connection string (`rediss://default:...@...upstash.io:6379`) |
| `COLLAB_WS_TOKEN_SECRET` | 256-bit Secret String | Symmetrically shared with Vercel (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | `https://collabspace.vercel.app` | Canonical Vercel web domain |
| `ALLOWED_ORIGINS` | `https://collabspace.vercel.app,collabspace-*.vercel.app` | Whitelist for production and git preview deployments |

---

## 4. Neon Preparation (Serverless PostgreSQL)

Neon provides managed, auto-scaling PostgreSQL with built-in connection pooling via PgBouncer.

### Project & Database Specifications
- **Project Name:** `collabspace`
- **Database Name:** `neondb` (default)
- **PostgreSQL Version:** 17
- **Region:** US East (N. Virginia `aws-us-east-1` or Ohio `aws-us-east-2`)
- **Compute Sizing:** 0.25 CU (minimum) to 1.0 CU with auto-suspend after 5 minutes.

### Connection String Separation (Crucial Architectural Requirement)
Neon provides two distinct connection strings in its dashboard. Both are required:

1. **Pooled Connection String (`DATABASE_URL`):**
   - **Where Used:** Runtime web application (Vercel) and WebSocket collaboration server (Render).
   - **Port:** `6543`
   - **Hostname:** Contains `-pooler` (e.g. `ep-tight-lake-123456-pooler.us-east-2.aws.neon.tech`).
   - **Parameters:** Must include `?sslmode=require`.
   - **Purpose:** Routes queries through PgBouncer connection pooler to prevent serverless function spikes from exhausting database connections.
2. **Direct Connection String (`DIRECT_URL`):**
   - **Where Used:** Local terminal / CI migration runner for `npx prisma migrate deploy` in Phase 7D-V3.3.
   - **Port:** `5432`
   - **Hostname:** Does **not** contain `-pooler` (e.g. `ep-tight-lake-123456.us-east-2.aws.neon.tech`).
   - **Parameters:** Must include `?sslmode=require`.
   - **Purpose:** Connects directly to PostgreSQL without PgBouncer, permitting session-level DDL locks (`advisory_lock`) required by Prisma migration engine.

---

## 5. Upstash Preparation (Serverless Redis)

Upstash provides low-latency Redis with native TLS and multi-connection persistence.

### Database Specifications
- **Database Name:** `collabspace-redis`
- **Region:** US East (N. Virginia `us-east-1`) — *Match Neon & Render region*
- **Primary Type:** Regional Serverless Redis
- **TLS (SSL):** **Mandatory (Enabled)**. Connection string must use `rediss://` protocol.
- **Port:** `6379`

### Operational Sizing & Eviction Policy
- **Usage Requirements:**
  1. **Pub/Sub Channels:** `collab:revoke` (instant permission and document revocation), `collab:control` (room management), `collab:comments` (comment threads).
  2. **Distributed Mutex:** `collab:lock:persist:<docId>` (1200ms TTL leader lock for PostgreSQL persistence).
  3. **Replay Cache:** `collab:consumed_ticket:<sha256_hash>` (60-second TTL single-use tombstones).
- **Eviction Configuration:**
  - Upstash manages memory dynamically. In the Upstash Console, ensure database memory limits provide ample headroom.
  - Where configurable, keep the maxmemory policy to `noeviction` or default `volatile-lru` with adequate memory to prevent premature eviction of active 60-second replay tombstones.

---

## 6. Vercel Preparation (Next.js Frontend & API)

Vercel will build and globally deploy the Next.js App Router application.

### Project Specifications
- **Project Name:** `collabspace`
- **Repository:** `https://github.com/Amruth4146/CollabSpace.git`
- **Branch:** `master`
- **Framework Preset:** `Next.js`
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Output Directory:** `.next`
- **Install Command:** `npm install`
- **Node.js Version:** 20.x or 22.x

### Build-Time vs Runtime Variable Requirements
- **Build-Time Inlining:** `NEXT_PUBLIC_COLLAB_WS_URL` and `NEXT_PUBLIC_APP_URL` are evaluated and bundled directly into client JavaScript chunks during `npm run build`. Therefore, `NEXT_PUBLIC_COLLAB_WS_URL` **must be configured with the actual Render WebSocket URL before initiating the Vercel build**.
- **Runtime API Routes:** `DATABASE_URL`, `REDIS_URL`, and `COLLAB_WS_TOKEN_SECRET` are consumed at runtime by serverless API handlers (`/api/documents/[id]/collab-token`, `/api/auth/*`, etc.).

---

## 7. Complete Environment Variable Matrix

| Variable Name | Vercel (Web App) | Render (Collab Server) | Required At | Sensitive? | Purpose & Constraints |
|:---|:---:|:---:|:---:|:---:|:---|
| `NODE_ENV` | Automatic (`production`) | **Required** (`production`) | Runtime | No | Enforces production security, disables debug mocks, and strictly requires signed collaboration tickets. |
| `DATABASE_URL` | **Required** | **Required** | Runtime | **YES** | Neon pooled connection string on port 6543 (`-pooler` with `?sslmode=require`). Connects via `@prisma/adapter-pg`. |
| `DIRECT_URL` | Optional / Build | Not Needed | Build / CLI | **YES** | Neon direct unpooled connection string on port 5432 with `?sslmode=require`. Used for Prisma migrations. |
| `REDIS_URL` | **Required** | **Required** | Runtime | **YES** | Upstash Redis connection string starting with `rediss://`. Powers real-time revocation and pub/sub. |
| `COLLAB_WS_TOKEN_SECRET` | **Required** | **Required** | Runtime | **YES** | 256-bit high-entropy secret (`openssl rand -hex 32`). Must be identical on both Vercel and Render. No `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_APP_URL` | **Required** | **Required** | Build & Runtime | No | Canonical web application origin (e.g. `https://collabspace.vercel.app`). Used for links and origin filtering. |
| `NEXT_PUBLIC_COLLAB_WS_URL` | **Required** | Not Needed | Build-Time | No | Secure WebSocket endpoint on Render (`wss://collabspace-collab.onrender.com`). Inlined into client TipTap editor. |
| `ALLOWED_ORIGINS` | Not Needed | **Required** | Runtime | No | Comma-separated list of permitted browser origins for WebSocket handshakes: `https://collabspace.vercel.app,collabspace-*.vercel.app`. |
| `PORT` | Not Needed | Injected by Render (`10000`) | Runtime | No | Server listens on Render's assigned port and binds to `0.0.0.0`. |
| `SMTP_HOST` / `SMTP_USER` / etc. | Optional | Not Needed | Runtime | **YES** | Optional email transport for verification and password reset emails. |

---

## 8. Manual Cloud Setup Guide

Follow these exact dashboard instructions to provision all four cloud components.

### 8.1 Provision Neon PostgreSQL
1. Log in to [Neon Console](https://console.neon.tech/).
2. Click **Create Project**.
3. Settings:
   - **Project Name:** `collabspace`
   - **Postgres Version:** `17`
   - **Region:** Select `US East (Ohio)` or `US East (N. Virginia)`.
4. Click **Create Project**.
5. In the **Connection Details** pane on the Project Dashboard:
   - Check the **Connection Pooling** toggle.
   - Copy the displayed string (this is your `DATABASE_URL`).
   - Uncheck the **Connection Pooling** toggle.
   - Copy the displayed direct string (this is your `DIRECT_URL`).
6. Save both connection strings securely in your local password manager.

### 8.2 Provision Upstash Redis
1. Log in to [Upstash Console](https://console.upstash.com/).
2. Click **Create Database**.
3. Settings:
   - **Name:** `collabspace-redis`
   - **Type:** `Regional`
   - **Region:** Select the same region as Neon (e.g. `us-east-1`).
   - **TLS (SSL):** Enabled (Default).
   - **Eviction:** Check that maxmemory eviction policy is set to `noeviction` or default.
4. Click **Create**.
5. In the database dashboard, locate the **Connect** section:
   - Select the **Node.js** tab (or **ioredis**).
   - Copy the `rediss://default:...@...upstash.io:6379` connection string (this is your `REDIS_URL`).
6. Save the connection string securely.

### 8.3 Generate Shared Secret
Before configuring Render or Vercel, generate the shared cryptographic signing key on your local machine:
```bash
openssl rand -hex 32
```
Save this 64-character hex string as your `COLLAB_WS_TOKEN_SECRET`.

### 8.4 Provision Render WebSocket Service
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Web Service**.
3. Select **Build and deploy from a Git repository** -> Connect `https://github.com/Amruth4146/CollabSpace.git`.
4. Configure service parameters:
   - **Name:** `collabspace-collab`
   - **Region:** US East (Ohio or Oregon, closest to Neon).
   - **Branch:** `master`
   - **Root Directory:** *(leave blank)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run start:collab`
   - **Instance Type:** `Starter` ($7/mo) or `Free`.
5. Under **Advanced** -> **Health Check Path**, enter: `/health`
6. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Your Neon pooled connection string)*
   - `REDIS_URL` = *(Your Upstash `rediss://` connection string)*
   - `COLLAB_WS_TOKEN_SECRET` = *(Your generated 64-character secret)*
   - `NEXT_PUBLIC_APP_URL` = `https://collabspace.vercel.app`
   - `ALLOWED_ORIGINS` = `https://collabspace.vercel.app,collabspace-*.vercel.app`
7. Click **Create Web Service**.
8. Note the assigned service URL: `https://collabspace-collab.onrender.com`.  
   *(Your WebSocket URL is `wss://collabspace-collab.onrender.com`).*

### 8.5 Provision Vercel Frontend Project
1. Log in to [Vercel Dashboard](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Import the `CollabSpace` Git repository (`Amruth4146/CollabSpace`).
4. Configure project settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
   - **Install Command:** `npm install`
5. Expand **Environment Variables** and add:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Your Neon pooled connection string)*
   - `DIRECT_URL` = *(Your Neon direct connection string)*
   - `REDIS_URL` = *(Your Upstash `rediss://` connection string)*
   - `COLLAB_WS_TOKEN_SECRET` = *(Identical 64-character secret used on Render)*
   - `NEXT_PUBLIC_APP_URL` = `https://collabspace.vercel.app`
   - `NEXT_PUBLIC_COLLAB_WS_URL` = `wss://collabspace-collab.onrender.com` *(From Step 8.4)*
6. **Do NOT click Deploy yet.** Save project settings and proceed to deployment sequencing.

---

## 9. Deployment Dependency Order

To ensure zero downtime, zero connection errors, and clean database initialization, the services must be deployed in strict sequential order:

```
Step 1: Provision Neon PostgreSQL & Upstash Redis (Phase 7D-V3.2)
  │
  ▼
Step 2: Initialize Database Schema on Neon (Phase 7D-V3.3)
  │     - Run: npx prisma migrate deploy (using DIRECT_URL)
  │     - Verify all 10 tables, indexes, and constraints exist
  │
  ▼
Step 3: Deploy Render WebSocket Server (Phase 7D-V3.4)
  │     - Render boots server/collab-server.ts on 0.0.0.0:$PORT
  │     - Probes /health endpoint until HTTP 200 OK
  │     - Copy public Render hostname
  │
  ▼
Step 4: Configure & Deploy Vercel Web App (Phase 7D-V3.5)
  │     - Set NEXT_PUBLIC_COLLAB_WS_URL to wss://<render-host>
  │     - Execute Vercel production build & global CDN deployment
  │
  ▼
Step 5: Production Acceptance Verification (Phase 7D-V3.6)
        - Multi-user editing, comment threads, persistence, and version history
```

---

## 10. Potential Blockers & Pre-Deployment Safeguards

| Potential Issue | Root Cause | Implemented Safeguard |
|:---|:---|:---|
| **Advisory Lock Failure on Migration** | Running migrations through PgBouncer pooler port 6543 | `prisma.config.ts` explicitly reads `DIRECT_URL` on unpooled port 5432 for all CLI migration operations. |
| **Serverless Connection Exhaustion** | Connecting hundreds of Vercel lambdas directly to PostgreSQL | `src/lib/prisma.ts` connects via pooled `DATABASE_URL` with `@prisma/adapter-pg`. |
| **WebSocket Untrusted Origin Error** | Broad wildcard `*.vercel.app` rejected by security filter | Documentation and configuration strictly specify project-scoped wildcards: `collabspace-*.vercel.app`. |
| **Frontend Editor Connecting to Localhost** | Missing `NEXT_PUBLIC_COLLAB_WS_URL` at build time | Documented as an absolute prerequisite before triggering Vercel build. |
| **Render Build Failure (`tsx not found`)** | `tsx` placed in `devDependencies` | Verified: `tsx` is declared in `dependencies` in `package.json`, ensuring clean installation in production. |
| **Replay Key Premature Eviction** | Managed Redis eviction under memory pressure | Upstash operational guidance requires `noeviction` policy and adequate memory provisioning. |

---

## 11. Exact Next Steps for Phase 7D-V3.3 (Database Migration)

Once the user creates the Neon PostgreSQL project and Upstash Redis database:
1. Provide the direct connection string (`DIRECT_URL`) and pooled string (`DATABASE_URL`).
2. Authorize **Phase 7D-V3.3 (Database Initialization & Migration)**.
3. In Phase 7D-V3.3, execute:
   ```bash
   npx prisma migrate deploy
   ```
4. Verify table initialization, indices, and foreign keys on Neon before deploying the Render or Vercel services.

---

```
================================================================================
                    INFRASTRUCTURE SPECIFICATION VERDICT:
              PASS — READY FOR PHASE 7D-V3.3 DATABASE MIGRATION
================================================================================
```

*Phase 7D-V3.2 preparation is complete. No cloud infrastructure has been created or deployed. Awaiting user authorization to proceed with Phase 7D-V3.3.*

