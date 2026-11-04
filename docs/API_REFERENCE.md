# CollabSpace REST API Reference

All API routes are served under `/api` and return `Content-Type: application/json`.

---

## 1. Authentication & Session Endpoints

### `POST /api/auth/register`
Creates a new user account, initializes a default personal workspace, and provisions a welcome document.

- **Authentication**: None
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "Jane Doe"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "Jane Doe",
        "emailVerified": null
      },
      "message": "Account created successfully."
    }
    ```
  - `400 Bad Request`: Validation failure (password < 8 chars, invalid email).
  - `409 Conflict`: An account with this email address already exists.

---

### `POST /api/auth/login`
Authenticates a user, verifies password against bcrypt hash, sets the `collabspace_session` HTTP-only cookie, and returns user metadata.

- **Authentication**: None (Rate limited: 5 attempts per 15-minute window).
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "Jane Doe"
      }
    }
    ```
    *Sets Cookie: `collabspace_session=<rawToken>; HttpOnly; SameSite=Lax; Path=/`*
  - `401 Unauthorized`: Invalid email or password.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### `POST /api/auth/logout`
Terminates the active session by deleting the session record from PostgreSQL and clearing the session cookie.

- **Authentication**: Session Cookie
- **Responses**:
  - `200 OK`: `{"message": "Logged out successfully."}`

---

### `GET /api/auth/me`
Retrieves the profile of the currently authenticated user.

- **Authentication**: Session Cookie
- **Responses**:
  - `200 OK`:
    ```json
    {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "Jane Doe",
        "avatar": null,
        "emailVerified": "2026-10-20T12:00:00.000Z"
      }
    }
    ```
  - `401 Unauthorized`: No active session found.

---

### `POST /api/auth/forgot-password`
Generates a cryptographically secure password reset token and stores its SHA-256 hash in PostgreSQL.

- **Authentication**: None
- **Request Body**: `{"email": "user@example.com"}`
- **Responses**:
  - `200 OK`: `{"message": "If that email exists, a reset link has been dispatched."}`

---

### `POST /api/auth/reset-password`
Consumes a valid password reset token, updates the bcrypt password hash, and invalidates all existing active sessions for security.

- **Authentication**: Token in payload
- **Request Body**:
  ```json
  {
    "token": "raw-reset-token-hex",
    "newPassword": "NewSecurePassword123!"
  }
  ```
- **Responses**:
  - `200 OK`: `{"message": "Password reset successfully. Please log in with your new password."}`
  - `400 Bad Request`: Expired or invalid reset token.

---

## 2. Workspace Endpoints

### `GET /api/workspaces`
Lists all workspaces where the authenticated user is a member.

- **Authentication**: Required
- **Responses**:
  - `200 OK`:
    ```json
    {
      "workspaces": [
        {
          "id": "uuid",
          "name": "Engineering Core",
          "slug": "engineering-core-179328",
          "role": "owner",
          "icon": "folder",
          "_count": { "documents": 12, "members": 4 }
        }
      ]
    }
    ```

---

### `POST /api/workspaces`
Creates a new workspace and sets the creator as `owner`.

- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "name": "Product Design",
    "icon": "palette"
  }
  ```
- **Responses**:
  - `201 Created`: Workspace object.
  - `400 Bad Request`: Missing or invalid workspace name.

---

### `PATCH /api/workspaces/[id]`
Renames a workspace or updates its metadata. Requires `owner` or `admin` role.

- **Authentication**: Required (Role: `admin` or `owner`)
- **Request Body**: `{"name": "Design Systems", "icon": "sparkles"}`
- **Responses**:
  - `200 OK`: Updated workspace record.
  - `403 Forbidden`: Insufficient permissions.

---

### `DELETE /api/workspaces/[id]`
Deletes a workspace and all nested documents. Requires `owner` role.

- **Authentication**: Required (Role: `owner` only)
- **Responses**:
  - `200 OK`: `{"message": "Workspace deleted successfully."}`
  - `403 Forbidden`: Non-owner cannot delete workspace.

---

### `GET /api/workspaces/[id]/members`
Lists all members in the workspace.

- **Authentication**: Required (`viewer` role and above)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "members": [
        {
          "id": "member-uuid",
          "role": "editor",
          "user": {
            "id": "user-uuid",
            "name": "Bob Smith",
            "email": "bob@example.com"
          }
        }
      ]
    }
    ```

---

### `POST /api/workspaces/[id]/members`
Invites a new member or adds them to the workspace.

- **Authentication**: Required (`admin` or `owner`)
- **Request Body**:
  ```json
  {
    "email": "colleague@example.com",
    "role": "commenter"
  }
  ```
- **Responses**:
  - `201 Created`: Created member object.
  - `403 Forbidden`: Caller lacks administration authority.

---

### `PATCH /api/workspaces/[id]/members/[memberId]`
Updates a member's role (e.g. promoting `commenter` to `editor`).

- **Authentication**: Required (`admin` or `owner`)
- **Request Body**: `{"role": "editor"}`
- **Responses**:
  - `200 OK`: Updated membership record.
  - `403 Forbidden`: Unauthorized role transition.

---

### `DELETE /api/workspaces/[id]/members/[memberId]`
Removes a member from the workspace.

- **Authentication**: Required (`admin` or `owner`, or self-removal)
- **Responses**:
  - `200 OK`: `{"message": "Member removed successfully."}`
  - `400 Bad Request`: Owner cannot leave without transferring ownership.

---

## 3. Document Endpoints

### `GET /api/documents/[id]`
Retrieves document metadata, content, and the authenticated user's permission set.

- **Authentication**: Required (`viewer` role and above)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "document": {
        "id": "uuid",
        "title": "Architecture RFC 001",
        "content": "<p>Document content...</p>",
        "workspaceId": "ws-uuid",
        "isArchived": false,
        "isTrashed": false,
        "createdAt": "2026-10-20T12:00:00.000Z",
        "updatedAt": "2026-10-29T14:00:00.000Z"
      },
      "userRole": "commenter",
      "permissions": {
        "canView": true,
        "canComment": true,
        "canEdit": false,
        "canManage": false
      }
    }
    ```
  - `403 Forbidden`: Outsider non-member.
  - `404 Not Found`: Document does not exist.

---

### `PATCH /api/documents/[id]`
Updates document title, content, or metadata. Requires `editor` role and above.

- **Authentication**: Required (`editor`, `admin`, or `owner`)
- **Request Body**:
  ```json
  {
    "title": "Updated RFC Title",
    "content": "<p>New content</p>"
  }
  ```
- **Responses**:
  - `200 OK`: Updated document object.
  - `403 Forbidden`: Commenters and Viewers receive 403 Forbidden.

---

### `DELETE /api/documents/[id]`
Soft-deletes the document to Trash (or permanently deletes if `permanent=true`).

- **Authentication**: Required (`admin` or `owner`)
- **Query Parameters**: `?permanent=true` (optional)
- **Responses**:
  - `200 OK`: `{"message": "Document moved to trash."}`
  - `403 Forbidden`: Insufficient role.

---

### `POST /api/documents/[id]/duplicate`
Creates an exact clone of the document with its title suffixed with `(Copy)`.

- **Authentication**: Required (`editor` and above)
- **Responses**:
  - `201 Created`: Cloned document object with a new unique ID.

---

### `POST /api/documents/[id]/restore-trash`
Restores a soft-deleted document back to the active workspace documents list.

- **Authentication**: Required (`editor` and above)
- **Responses**:
  - `200 OK`: Restored document object.

---

## 4. Version History Endpoints

### `GET /api/documents/[id]/versions`
Retrieves the chronological version history timeline for a document.

- **Authentication**: Required (`viewer` and above)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "versions": [
        {
          "id": "version-uuid",
          "versionNumber": 2,
          "title": "Architecture RFC 001",
          "createdAt": "2026-10-29T15:30:00.000Z",
          "author": { "name": "Alice" }
        }
      ]
    }
    ```

---

### `POST /api/documents/[id]/versions`
Manually triggers a checkpoint snapshot.

- **Authentication**: Required (`editor` and above)
- **Request Body**: `{"title": "v1.0 Baseline Release"}`
- **Responses**:
  - `201 Created`: Snapshot object.

---

### `POST /api/documents/[id]/versions/[versionId]/restore`
Restores the document to a previous snapshot state. Creates a pre-restore safety checkpoint and applies the differential CRDT update to live sessions.

- **Authentication**: Required (`editor` and above)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "message": "Document successfully restored to version 1.",
      "versionNumber": 1
    }
    ```

---

## 5. Comments & Discussion Endpoints

### `GET /api/documents/[id]/comments`
Retrieves all root comment threads and nested replies for the document.

- **Authentication**: Required (`viewer` and above)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "comments": [
        {
          "id": "comment-uuid",
          "documentId": "doc-uuid",
          "quote": "architecture overview",
          "anchorPosition": "p-2",
          "content": "Please verify this section.",
          "resolved": false,
          "resolvedAt": null,
          "author": {
            "id": "user-uuid",
            "name": "Bob (Commenter)",
            "avatar": null
          },
          "replies": [
            {
              "id": "reply-uuid",
              "content": "Verified and looks solid.",
              "author": { "name": "Alice (Editor)" },
              "createdAt": "2026-10-29T16:00:00.000Z"
            }
          ],
          "createdAt": "2026-10-29T15:55:00.000Z"
        }
      ],
      "userRole": "commenter",
      "canComment": true
    }
    ```

---

### `POST /api/documents/[id]/comments`
Posts a new root comment thread or a nested reply to an existing thread. Publishes an event to Redis `collab:comments`.

- **Authentication**: Required (`commenter`, `editor`, `admin`, or `owner`)
- **Request Body (Root Thread)**:
  ```json
  {
    "text": "Can we clarify the Redis failover strategy here?",
    "quote": "Redis failover",
    "anchorPosition": "p-4"
  }
  ```
- **Request Body (Nested Reply)**:
  ```json
  {
    "text": "Added failover documentation.",
    "parentId": "comment-uuid"
  }
  ```
- **Responses**:
  - `201 Created`: The created comment object.
  - `400 Bad Request`: Empty text, or invalid `parentId`.
  - `403 Forbidden`: Viewers and outsiders are rejected with 403 Forbidden.

---

### `PATCH /api/documents/[id]/comments/[commentId]`
Updates comment text (author only) or resolves/reopens a thread (`editor` and above, or thread author).

- **Authentication**: Required
- **Request Body**: `{"resolved": true}` or `{"text": "Updated text"}`
- **Responses**:
  - `200 OK`: Updated comment object.
  - `403 Forbidden`: Unauthorized update attempt.

---

### `DELETE /api/documents/[id]/comments/[commentId]`
Deletes a comment or reply. Authors can delete their own comments; workspace owners and admins can moderate any comment.

- **Authentication**: Required
- **Responses**:
  - `200 OK`: `{"message": "Comment deleted successfully."}`
  - `403 Forbidden`: Non-author/non-admin rejected.

---

## 6. Observability Endpoints

### `GET /api/health`
Returns system health status for PostgreSQL and Redis connectivity.

- **Authentication**: None
- **Responses**:
  - `200 OK`:
    ```json
    {
      "status": "healthy",
      "timestamp": "2026-10-29T21:00:00.000Z",
      "database": { "status": "healthy", "latencyMs": 12 },
      "redis": { "status": "healthy", "latencyMs": 4 }
    }
    ```
