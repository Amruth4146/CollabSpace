# CollabSpace Testing Guide & Empirical Verification Suite

This document outlines the testing architecture, test commands, categories, reproduction steps, and empirical results for CollabSpace.

All test suites were verified during the final acceptance audit, achieving **349 / 349 passing tests (100% pass rate)**. Full empirical logs and run summaries are certified in [`FINAL_ACCEPTANCE_REPORT.md`](FINAL_ACCEPTANCE_REPORT.md).

---

## 1. Quick Test Execution Reference

| Test Suite | Command | Test Count | Scope |
|---|---|:---:|---|
| **Full Suite** | `npm test` | 349 | Runs all unit, integration, and E2E suites |
| **Authentication & Crypto** | `npm run test:auth` | 51 | Bcrypt hashing, session hashing, rate limiting, token reuse |
| **Workspaces & Documents** | `npm run test:workspace` | 57 | CRUD, membership, soft delete, star, duplication, search |
| **Rich-Text Engine** | `npm run test:editor` | 43 | TipTap marks, nodes, sanitization, XSS defense, reload |
| **Real-Time Collaboration** | `npm run test:collab` | 19 | Yjs CRDT convergence, presence, disconnect, offline catch-up |
| **History & Durability** | `npm run test:history` | 29 | Snapshots, non-destructive restore, retention cap, cold boot |
| **Redis Scaling** | `npm run test:redis` | 17 | Two instances (ports 1245/1246), loopback suppression, pub/sub |
| **RBAC Permissions Matrix** | `npm run test:permissions` | 46 | 5-tier role hierarchy matrix, wire-level mutation denial |
| **Comments REST & Real-time**| `npm run test:comments` | 53 | Threads, replies, quotes, resolution, RBAC, Redis broadcast |
| **Anchor Stability Audit** | `npx tsx --env-file=.env scripts/test-anchor-stability.ts` | 5 | 5 edge-case scenarios for DOM quote highlighting |
| **Real-Time Security Audit** | `npx tsx --env-file=.env scripts/test-realtime-security.ts` | 25 | 4401/4403 rejection, member revocation, cross-doc isolation |
| **Playwright Three-User E2E**| `npx playwright test tests/e2e/three-user-acceptance.spec.ts` | 2 | Editor, Commenter, Viewer browser sessions |
| **Playwright Two-Editor E2E**| `npx playwright test tests/e2e/two-editor-collaboration.spec.ts` | 2 | Concurrent editing, presence, safe history rollback |

---

## 2. Test Environment Setup & Prerequisites

Before running integration and E2E tests, ensure PostgreSQL and Redis are active:

```bash
# Start Docker services
docker compose up -d

# Verify services
docker compose ps
```

Ensure `.env` matches `.env.example` configurations.

---

## 3. Test Categories & Detailed Coverage

### 3.1. Authentication & Cryptography (`npm run test:auth`)
- **Bcrypt Hashing**: Validates cost factor 12, salt generation, and plain-text non-persistence.
- **Session Tokens**: Generates 32-byte crypto random tokens; stores SHA-256 hash in PostgreSQL; asserts raw token differs from digest.
- **Timing Attacks**: Validates constant-time string equality checks (`crypto.timingSafeEqual`).
- **Rate Limiting**: Tests sliding-window IP limits (blocks after 5 consecutive failures).
- **Session Revocation**: Confirms password reset invalidates all active sessions across devices.

### 3.2. Real-Time CRDT Collaboration (`npm run test:collab`)
- **Concurrent Typing**: Two virtual Yjs clients submit simultaneous transactions without acquiring write locks. State converges to 100% identical content. Zero last-write-wins loss.
- **Ephemeral Presence**: Validates user color hashing, cursor coordinates, and awareness cleanup on disconnect without polluting document text.
- **Offline Catch-Up**: Client disconnects, edits locally, reconnects, and deterministically reconciles missing updates with concurrent online edits.

### 3.3. Redis Multi-Instance Distributed Scaling (`npm run test:redis`)
- **Two Isolated Servers**: Spawns Instance 1 on port 1245 (`inst_alpha`) and Instance 2 on port 1246 (`inst_beta`).
- **Cross-Instance Sync**: Edits on Instance 1 publish to Redis channel `collab:doc:{docId}` and propagate to clients on Instance 2.
- **Comment Event Distribution**: Comment published to Redis `collab:comments` channel delivers concurrently to clients on both instances.
- **Loopback Deduplication**: Validates that 8-byte `INSTANCE_ID` prefix suppresses reflection loops.
- **Persistence Locking**: Validates distributed lock acquisition preventing simultaneous duplicate writes to PostgreSQL.

### 3.4. Wire-Level Permission Security (`npm run test:permissions` & `test-realtime-security.ts`)
- **Handshake Rejection**:
  - Missing token &rarr; Close Code `4401`
  - Invalid / Expired token &rarr; Close Code `4401`
  - Non-member outsider &rarr; Close Code `4403`
  - Revoked member &rarr; Close Code `4403`
- **Mutation Interception**:
  - Commenter or Viewer connects with `canWrite = false`.
  - When the client sends a raw `messageSync` update buffer, the collab server drops the packet and emits `messageAuth` with `writePermissionDenied`.
  - PostgreSQL document content remains completely untampered.

### 3.5. Comments & Threaded Discussion (`npm run test:comments`)
- **Thread Hierarchy**: Root threads created with quoted excerpts; nested replies attached via `parentId`.
- **RBAC**:
  - Viewers: Cannot post comments or replies (403 Forbidden).
  - Commenters: Can post comments and replies (201 Created), but cannot edit document text (403 Forbidden).
  - Authors: Can edit and delete their own comments.
  - Owners/Admins: Can moderate and delete any comment thread.
- **Thread Lifecycle**: Resolving a thread blocks subsequent replies (400 Bad Request); reopening allows participation.
- **Cross-Document Isolation**: Comments created on Document A are strictly invisible to Document B.

### 3.6. Browser Automation E2E (Playwright)
- **`three-user-acceptance.spec.ts`**:
  - Three isolated browser contexts (User A = Editor, User B = Commenter, User C = Viewer).
  - Verifies DOM `contenteditable` attributes: Editor (`true`), Commenter (`false`), Viewer (`false`).
  - Commenter selects text and submits inline comment; Editor receives it live; Editor replies and resolves thread; Commenter sees resolution.
  - Hard page reload confirms full hydration from PostgreSQL.
- **`two-editor-collaboration.spec.ts`**:
  - Two simultaneous editors type concurrent paragraphs.
  - Live peer count badge tracks active connection count (`2`).
  - Disconnecting one editor decrements peer count to `1`; reconnecting increments back to `2`.
  - Safe Version History: Checkpoint `v1` created; destructive edits applied; user confirms modal restoration to `v1`; server generates safety checkpoint and applies differential Yjs restore to all active peers in real time.

---

## 4. Anchor Stability Audit (`scripts/test-anchor-stability.ts`)

The comment system was subjected to 5 edge-case scenarios:
1. **Insert Before Anchor**: **STABLE**. Exact quote resolves target element.
2. **Edit Inside Anchor**: **KNOWN LIMITATION**. Mutating characters inside the quote causes strict substring search to fail. The discussion thread remains preserved in the sidebar, but in-text highlighting is deactivated.
3. **Duplicate Anchor Text**: **KNOWN LIMITATION**. First occurrence in reading order is highlighted.
4. **Delete Anchor Text**: **GRACEFULLY ORPHANED**. Search returns `found = false` with 0 crashes or unhandled exceptions.
5. **Concurrent Edits Near Anchor**: **STABLE**. Surrounding insertions merge cleanly without detaching quote.

*See [`FINAL_ACCEPTANCE_REPORT.md`](FINAL_ACCEPTANCE_REPORT.md#5-step-4-comment-anchor-stability-audit) for complete architectural analysis between Quote-Based and Yjs Relative Positions.*

---

## 5. Verification Commands for Release

Prior to submitting code or creating releases, run:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Production Build
npm run build
```
