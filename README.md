# CollabSpace

> High-Performance Real-Time Collaborative Workspace with Conflict-Free CRDTs, Granular Role-Based Access Control, and Persistent Commenting.

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-blue?logo=react)](https://react.dev/)
[![Yjs CRDT](https://img.shields.io/badge/Yjs-CRDT-orange)](https://github.com/yjs/yjs)
[![TipTap](https://img.shields.io/badge/TipTap-3.32-green)](https://tiptap.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2F17-336791?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0-red?logo=redis)](https://redis.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-349%20Passed-brightgreen)](docs/FINAL_ACCEPTANCE_REPORT.md)

---

## 1. Project Overview

CollabSpace is a modern real-time collaborative document platform engineered for engineering teams, researchers, and remote organizations. Designed to eliminate collaborative merge conflicts, CollabSpace pairs rich-text editing with decentralized CRDT state synchronization, ephemeral awareness tracking, threaded inline comments, and multi-version audit history.

Every document edit is synchronized across clients with mathematical convergence guarantees, persisted durably to PostgreSQL, and scalable horizontally across multiple Node.js instances via Redis Pub/Sub.

---

## 2. Problem Statement

Conventional collaborative document editors face severe architectural friction:
- **Last-Write-Wins Data Loss**: Naive REST autosaves overwrite concurrent paragraphs, causing data loss for distributed teams.
- **WebSocket Protocol Bloat & Disconnects**: Unstable socket lifecycles cause memory leaks, phantom cursors, and unrecoverable room state upon transient network drops.
- **Binary/Relational Friction**: CRDT state vectors are notoriously challenging to integrate cleanly with relational databases without ballooning payload overhead or corrupting relational constraints.
- **Permission Ambiguity**: Most collaborative platforms enforce permissions solely at the page boundary. Once a WebSocket connection is opened, unauthorized clients can broadcast raw binary updates to bypass UI restrictions.

**CollabSpace solves these challenges** through wire-level RBAC message validation, leader-elected debounced persistence, Yjs CRDT differential updates, and multi-instance Pub/Sub broadcasting.

---

## 3. Key Features

- **Real-Time Bidirectional Sync**: Sub-50ms collaborative editing powered by Yjs Conflict-Free Replicated Data Types (`yjs` + `y-websocket`).
- **Presence & Live Awareness**: Dynamic collaborator avatars, live colored cursor coordinates, selection ranges, and automated disconnect purging.
- **Five-Tier Role-Based Access Control**:
  - `owner`: Workspace creator with full destructive and administrative ownership.
  - `admin`: Member and document management authority.
  - `editor`: Full document reading, editing, checkpointing, and commenting permissions.
  - `commenter`: Read-only document view with inline quoting, commenting, and reply privileges.
  - `viewer`: Read-only view access. Wire-level and REST mutations strictly blocked.
- **Wire-Level Protocol Hardening**: WebSocket collab server validates JWT/session credentials and drops unauthorized mutation packets (`writePermissionDenied`).
- **Threaded Inline Comments**: Highlight text quotes, initiate threaded discussions, submit nested replies, and resolve/reopen discussion workflows.
- **Immutable Version History**: Manual checkpoints, automatic snapshot retention (capped at 50 versions), non-destructive diff restoration, and pre-restore safety checkpoints.
- **Trash & Soft Deletion Lifecycle**: Safe soft-deletion with full restoration, cross-workspace document transfer, and permanent destruction safeguards.
- **Horizontal Multi-Instance Scaling**: Seamless synchronization across independent collaboration servers via Redis channels (`collab:doc:*`, `collab:awareness:*`, `collab:comments`) with `INSTANCE_ID` loopback deduplication.

---

## 4. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | Next.js (App Router, Turbopack) | `16.4.2` | Server/Client components, SSR, dynamic routing |
| **UI Library** | React | `19.3.0` | Declarative UI state and hooks |
| **Rich-Text Engine** | TipTap | `3.32.0` | Headless ProseMirror-based rich-text editing |
| **CRDT Synchronization** | Yjs & y-protocols | `13.6.33` / `1.0.7` | Conflict-free real-time state resolution |
| **WebSocket Server** | Node.js `ws` + `y-websocket` | `8.22.0` / `3.1.0` | Bi-directional binary protocol server |
| **Database ORM** | Prisma | `7.10.1` | Type-safe schema definition and querying |
| **Primary Database** | PostgreSQL | `16 / 17` | Relational document, user, session, and comment storage |
| **Cache & Pub/Sub** | Redis (ioredis) | `7.0` / `6.0.0` | Distributed pub/sub bus and persistence locking |
| **Security & Auth** | bcryptjs / Node crypto | `3.0.3` | Password hashing (cost 12), SHA-256 session tokens |
| **Testing Engine** | Playwright & Vitest | `1.57.0` / `3.2.4` | Multi-user browser E2E and unit test coverage |

---

## 5. System Architecture Overview

CollabSpace utilizes a decoupled dual-server architecture:
1. **Next.js Web Application (`:3000`)**: Handles user authentication, workspace/document management REST APIs, static page serving, and client-side UI rendering.
2. **WebSocket Collaboration Server (`:1234`)**: Dedicated lightweight Node.js service managing active Yjs document rooms, ephemeral presence awareness, and Redis Pub/Sub coordination.

```mermaid
flowchart TD
    subgraph Clients["Collaborative Clients"]
        ClientA["User A (Editor)"]
        ClientB["User B (Commenter)"]
        ClientC["User C (Viewer)"]
    end

    subgraph Edge["Next.js Web Server (:3000)"]
        NextApp["Next.js App Router"]
        AuthModule["Auth & RBAC Middleware"]
        REST_API["REST Endpoints (/api/*)"]
    end

    subgraph CollabCluster["Collaboration Cluster"]
        Collab1["Collab Server 1 (:1234)"]
        Collab2["Collab Server 2 (:1246)"]
    end

    subgraph Infrastructure["Data & Messaging Tier"]
        RedisCluster[("Redis 7 Pub/Sub & Lock")]
        PostgresDB[("PostgreSQL 16 Database")]
    end

    ClientA -- HTTP / Cookies --> NextApp
    ClientB -- HTTP / Cookies --> NextApp
    ClientC -- HTTP / Cookies --> NextApp

    ClientA -- "WebSocket (Binary Yjs)" --> Collab1
    ClientB -- "WebSocket (Read-Only)" --> Collab1
    ClientC -- "WebSocket (Read-Only)" --> Collab2

    Collab1 <--> RedisCluster
    Collab2 <--> RedisCluster

    Collab1 -- "Debounced Persistence (yjsState)" --> PostgresDB
    Collab2 -- "Leader Lock & Rehydration" --> PostgresDB

    REST_API -- "Prisma ORM" --> PostgresDB
    REST_API -- "Publish (collab:comments)" --> RedisCluster
```

---

## 6. Prerequisites

Ensure your host environment satisfies:
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **Docker Desktop**: Required for local PostgreSQL and Redis containers (or local native installations)
- **Operating System**: Windows 10/11, macOS, or Linux

---

## 7. Local Installation

Clone the repository to your local workstation:

```bash
git clone https://github.com/YOUR_ORGANIZATION/collabspace.git
cd collabspace
```

Install application dependencies:

```bash
npm install
```

---

## 8. PostgreSQL and Redis Setup

The fastest way to initialize required backing services is using the included `docker-compose.yml`:

```bash
# Start PostgreSQL (port 5432) and Redis (port 6379) in detached mode
docker compose up -d

# Verify container health
docker compose ps
```

*Expected Output:*
```
NAME                   IMAGE                 STATUS                   PORTS
collabspace-postgres   postgres:17-alpine    Up (healthy)             127.0.0.1:5432->5432/tcp
collabspace-redis      redis:7-alpine        Up (healthy)             127.0.0.1:6379->6379/tcp
```

---

## 9. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Review `.env` settings:

```dotenv
# PostgreSQL Database Connection
DATABASE_URL="postgresql://collabspace:collabspace_local_dev@127.0.0.1:5432/collabspace?schema=public"

# Redis Connection (Pub/Sub & Distributed Locking)
REDIS_URL="redis://127.0.0.1:6379"

# Session Security Secret (32+ character random string)
SESSION_SECRET="your-32-char-random-production-security-secret"

# Web Application Host
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# WebSocket Collaboration Service
COLLAB_PORT="1234"
NEXT_PUBLIC_COLLAB_WS_URL="ws://localhost:1234"
```

---

## 10. Prisma Setup and Migrations

Push the Prisma database schema into your PostgreSQL instance:

```bash
# Push schema structure and create database tables
npx prisma db push

# Generate the type-safe Prisma client
npx prisma generate
```

---

## 11. Running Next.js

Start the Next.js frontend and REST API server:

```bash
# Development Mode (Hot Reloading via Turbopack)
npm run dev

# Production Build & Run
npm run build
npm run start
```

The web application will be accessible at: **[http://localhost:3000](http://localhost:3000)**

---

## 12. Running the Collaboration Server

The WebSocket collaboration server runs as a separate process coordinating real-time CRDT updates:

```bash
npm run collab
```

*Console Output:*
```
[CollabServer] WebSocket collaboration server active on port 1234
[CollabServer] Instance ID: a8f9c2d1
[Redis] Connected successfully to Redis.
```

---

## 13. Running Tests

CollabSpace includes an exhaustive testing suite covering unit, integration, distributed clustering, and multi-browser Playwright E2E tests:

```bash
# Run All Integration & Regression Tests
npm test

# Run Specific Targeted Suites
npm run test:auth          # Cryptography, bcrypt, session hashing, RBAC (51 tests)
npm run test:workspace     # Workspaces, documents, trash, star, archive (57 tests)
npm run test:editor        # TipTap marks, nodes, sanitization, XSS (43 tests)
npm run test:collab        # Yjs CRDT convergence, presence, disconnect (19 tests)
npm run test:history       # Version timeline, restore, retention cap (29 tests)
npm run test:redis         # Multi-instance scaling, failover, pub/sub (17 tests)
npm run test:permissions   # Complete 5-tier role hierarchy matrix (46 tests)
npm run test:comments      # Comments REST API, replies, resolve, RBAC (53 tests)

# Run Playwright Browser Automation Suites
npx playwright test tests/e2e/three-user-acceptance.spec.ts
npx playwright test tests/e2e/two-editor-collaboration.spec.ts

# Code Quality Checks
npx tsc --noEmit           # Type safety validation (0 errors)
npm run lint               # ESLint check (0 errors, 0 warnings)
```

---

## 14. Permission Roles

CollabSpace implements a strict five-tier hierarchical permission model:

```
[Owner: 5] -> [Admin: 4] -> [Editor: 3] -> [Commenter: 2] -> [Viewer: 1]
```

| Permission Capability | Owner | Admin | Editor | Commenter | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| **View Document Content** | Yes | Yes | Yes | Yes | Yes |
| **Track Collaborator Presence** | Yes | Yes | Yes | Yes | Yes |
| **Read Comments & Replies** | Yes | Yes | Yes | Yes | Yes |
| **Post Comments & Replies** | Yes | Yes | Yes | Yes | No |
| **Resolve / Reopen Discussions**| Yes | Yes | Yes | Author Only | No |
| **Edit Document Rich Text** | Yes | Yes | Yes | No | No |
| **Create Manual Checkpoints** | Yes | Yes | Yes | No | No |
| **Restore Previous Versions** | Yes | Yes | Yes | No | No |
| **Manage Members & Invite** | Yes | Yes | No | No | No |
| **Delete Workspace / Document** | Yes | No | No | No | No |

---

## 15. Real-Time Collaboration Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Editor)
    actor Bob as Bob (Commenter)
    participant WS as Collab Server (:1234)
    participant Redis as Redis Pub/Sub
    participant DB as PostgreSQL 16

    Alice->>WS: Connect ws://localhost:1234/:docId?token=aliceToken
    WS->>DB: Validate Session Token & Access Rights
    DB-->>WS: Authorized (Role: editor, canWrite: true)
    WS-->>Alice: Handshake (SyncStep1 + Awareness)

    Bob->>WS: Connect ws://localhost:1234/:docId?token=bobToken
    WS->>DB: Validate Session Token & Access Rights
    DB-->>WS: Authorized (Role: commenter, canWrite: false)
    WS-->>Bob: Handshake (SyncStep1 + Awareness)

    Alice->>WS: Send Yjs Update Buffer (Type text: "Architecture RFC")
    WS->>Redis: Publish collab:doc:id (Update Buffer + InstanceID)
    WS-->>Bob: Forward Update Frame (DOM updates live)
    WS->>DB: Debounced Autosave (yjsState binary BLOB)

    Bob->>Alice: Highlight text & POST /api/documents/:id/comments
    Note over Bob: REST API verifies canComment=true
    Bob->>DB: Insert Comment record (quote, text, authorId)
    Bob->>Redis: Publish collab:comments (Comment JSON)
    Redis-->>WS: Receive comment notification
    WS-->>Alice: Dispatch binary Frame (messageComment = 3)
    Note over Alice: Comments Sidebar updates in real time
```

---

## 16. Known Limitations

In the interest of full technical transparency, the following architectural limitations are documented:

1. **Quote-Based Comment Anchoring Fragility**:
   - Comments attach using exact substring quotes and DOM text traversal.
   - *Limitation*: Editing or deleting characters *inside* the quoted text breaks exact string matching. The discussion thread remains preserved and readable in the sidebar, but the in-editor highlight is unlinked.
   - *Enterprise Alternative*: Yjs Relative Positions (`Y.createRelativePositionFromTypeIndex`) bind directly to CRDT item identifiers but introduce binary schema dependencies for read-only roles.
2. **Duplicate Phrase Matching**:
   - If the exact same phrase exists in multiple sections of a document, clicking the comment in the sidebar highlights the first occurrence in document reading order.
3. **In-Memory Active Document Map**:
   - Active collaboration rooms remain stored in memory (`docs = new Map<string, WSSharedDoc>()`). While persistence is debounced and safe, massive-scale multi-tenant deployments should introduce an LRU cache eviction policy for idle documents.

---

## 17. Project Structure

```
collabspace/
├── docker-compose.yml            # Local PostgreSQL & Redis container definitions
├── package.json                  # Scripts, dependencies, and engine targets
├── playwright.config.ts          # E2E browser automation configuration
├── prisma/
│   └── schema.prisma             # PostgreSQL data model definitions
├── server/
│   └── collab-server.ts          # WebSocket server (Yjs, Redis PubSub, Wire RBAC)
├── src/
│   ├── app/                      # Next.js App Router pages and API routes
│   │   ├── api/                  # REST endpoints (auth, workspaces, documents, comments)
│   │   ├── dashboard/            # Workspace navigation and document management
│   │   ├── editor/[id]/          # Collaborative document editor interface
│   │   ├── login/ / signup/      # Authentication workflows
│   │   └── page.tsx              # Marketing landing page
│   ├── components/               # Modular UI and editor components
│   │   ├── dashboard/            # Workspace switchers, cards, modals
│   │   ├── editor/               # TipTap editor, bubble menu, history, comments
│   │   └── ui/                   # Reusable accessible design system primitives
│   └── lib/                      # Core business logic and shared helpers
│       ├── auth/                 # Crypto, rate limiting, session, authorization
│       ├── prisma.ts             # Prisma ORM client singleton
│       ├── redis.ts              # Redis client singleton and health checks
│       ├── sanitize.ts           # XSS neutralization utilities
│       └── snapshots.ts          # Version history checkpoint engine
├── docs/                         # In-depth technical architecture and audit reports
│   ├── FINAL_ACCEPTANCE_REPORT.md# Complete 349-test verification certification
│   ├── ARCHITECTURE.md           # System design & distributed topology
│   ├── API_REFERENCE.md          # Comprehensive REST API specifications
│   ├── DATABASE_SCHEMA.md        # Relational schema & entity relationships
│   ├── TESTING.md                # Test execution guide & reproduction steps
│   └── SUBMISSION_CHECKLIST.md   # Final verification and submission rubric
└── scripts/                      # Automated test scripts & validation suites
```

---

## 18. Troubleshooting

### Port 1234 or 3000 Already in Use
If another process is bound to the server ports:
```bash
# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 1234).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Linux / macOS
lsof -ti :1234 | xargs kill -9
lsof -ti :3000 | xargs kill -9
```

### Redis Connection Refused
Verify that Redis is running and responding to ping:
```bash
docker exec -it collabspace-redis redis-cli ping
# Expected response: PONG
```

### Database Schema Out of Sync
If schema changes occur:
```bash
npx prisma db push --force-reset   # Caution: Clears local test records
npx prisma generate
```

---

## 19. Demo Instructions

To demonstrate real-time collaboration with multiple roles on a single workstation:

1. **Start Services**:
   ```bash
   # Terminal 1: Next.js Web App
   npm run start
   
   # Terminal 2: Collab Server
   npm run collab
   ```
2. **Open Window 1 (Editor)**:
   - Navigate to `http://localhost:3000/signup`.
   - Register an account (e.g. `editor@demo.dev`).
   - Create a new document in your default workspace.
   - Click **Share** in the editor header, copy the document URL, or invite another user.
3. **Open Window 2 (Incognito Browser / Separate Profile)**:
   - Navigate to `http://localhost:3000/signup`.
   - Register a second user (e.g. `commenter@demo.dev`).
   - In Window 1, invite `commenter@demo.dev` with role **Commenter**.
   - Window 2 opens the document: notice the editor is read-only, but text selection displays the floating comment bubble.
   - Submit a comment: notice it appears instantly on Window 1 in real time.
4. **Test Safe Version History**:
   - In Window 1, open the **History** tab in the right sidebar.
   - Click **Checkpoint** to save Version 1.
   - Edit the document heavily.
   - Click **Restore to v1**: observe both browser windows revert instantly to Version 1 without page refresh.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
