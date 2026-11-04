import { User, Workspace, DocumentItem, CommentItem, VersionEntry, WorkspaceMember } from './types';

export const CURRENT_USER: User = {
  id: 'usr_me',
  name: 'Alex Rivera',
  email: 'alex.rivera@collabspace.dev',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
  role: 'owner',
  color: '#6366F1', // Indigo
  status: 'online',
};

export const MOCK_COLLABORATORS: User[] = [
  {
    id: 'usr_sarah',
    name: 'Sarah Chen',
    email: 'sarah.c@collabspace.dev',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&auto=format&fit=crop&q=80',
    role: 'editor',
    color: '#EC4899', // Pink
    status: 'online',
  },
  {
    id: 'usr_marcus',
    name: 'Marcus Brody',
    email: 'marcus.b@collabspace.dev',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&auto=format&fit=crop&q=80',
    role: 'editor',
    color: '#10B981', // Emerald
    status: 'online',
  },
  {
    id: 'usr_elena',
    name: 'Elena Rostova',
    email: 'elena.r@collabspace.dev',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=128&auto=format&fit=crop&q=80',
    role: 'viewer',
    color: '#F59E0B', // Amber
    status: 'idle',
  },
];

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 'ws_core',
    name: 'Acme Product Team',
    slug: 'acme-product',
    plan: 'Pro',
    icon: '⚡',
    documentCount: 14,
    membersCount: 8,
  },
  {
    id: 'ws_eng',
    name: 'CollabSpace Engineering',
    slug: 'collabspace-eng',
    plan: 'Enterprise',
    icon: '🚀',
    documentCount: 29,
    membersCount: 16,
  },
  {
    id: 'ws_personal',
    name: 'Personal Scratchpad',
    slug: 'personal',
    plan: 'Free',
    icon: '💡',
    documentCount: 5,
    membersCount: 1,
  },
];

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-prd-sync',
    title: 'Product Requirements: Real-Time Sync Engine v2',
    icon: '📄',
    excerpt: 'Detailed specification covering CRDT conflict resolution, presence awareness, and connection resilience.',
    content: `
      <h1>Product Requirements: Real-Time Sync Engine v2</h1>
      <p>This document details the architectural requirements for the <strong>CollabSpace</strong> collaborative engine, addressing conflict-free replicated data types (CRDTs), optimistic updates, and low-latency cursor broadcasting.</p>
      
      <h2>1. Executive Summary</h2>
      <p>CollabSpace enables distributed cross-functional teams to brainstorm, draft, and finalize mission-critical documents with zero friction. Under high latency conditions, the document state must remain consistent across all active peers without locking the document.</p>
      
      <blockquote>
        "The fastest sync engine is the one you never notice. Millisecond responsiveness is our prime directive."
      </blockquote>

      <h2>2. Key Deliverables</h2>
      <ul>
        <li><strong>Sub-50ms Local Echo:</strong> Keystrokes must immediately mutate local DOM with zero perceived latency.</li>
        <li><strong>Multi-Cursor Awareness:</strong> Display remote carets with color-coded author badges and smooth interpolation.</li>
        <li><strong>Offline Buffering:</strong> Store un-synced deltas in IndexedDB and reconcile transparently upon reconnection.</li>
        <li><strong>Granular Permissions:</strong> Role-based access control supporting Owners, Editors, Commenters, and Viewers.</li>
      </ul>

      <h2>3. Technical Milestones</h2>
      <ol>
        <li>Establish WebRTC and WebSocket transport fallbacks.</li>
        <li>Integrate Yjs byte-level delta compression.</li>
        <li>Wire up end-to-end telemetry and connection health monitors.</li>
      </ol>

      <p>Please leave comments in the right-hand panel for any section needing clarification before sprint review.</p>
    `,
    updatedAt: 'Just now',
    createdAt: 'Oct 14, 2026',
    author: CURRENT_USER,
    collaborators: [MOCK_COLLABORATORS[0], MOCK_COLLABORATORS[1]],
    tags: ['Architecture', 'Engine', 'Priority-High'],
    isStarred: true,
  },
  {
    id: 'doc-roadmap-2027',
    title: 'Q1 & Q2 Product Roadmap & Deliverables',
    icon: '🗺️',
    excerpt: 'Quarterly breakdown of key customer milestones, enterprise SSO, and mobile responsive refinements.',
    content: `
      <h1>Q1 & Q2 Product Roadmap</h1>
      <p>Welcome to the 2027 strategic roadmap. Our core focus centers around enterprise security, markdown import/export parity, and rich media embeddings.</p>
      <h2>Key Initiatives</h2>
      <ul>
        <li>SOC2 Type II Compliance verification</li>
        <li>Granular team workspace permissions</li>
        <li>Native desktop launcher with offline mode</li>
      </ul>
    `,
    updatedAt: '2 hours ago',
    createdAt: 'Oct 12, 2026',
    author: MOCK_COLLABORATORS[0],
    collaborators: [CURRENT_USER, MOCK_COLLABORATORS[2]],
    tags: ['Planning', 'Roadmap'],
    isStarred: true,
  },
  {
    id: 'doc-design-system',
    title: 'Design System & Component Guidelines',
    icon: '🎨',
    excerpt: 'Typography, token definitions, surface elevations, and accessible focus outlines for CollabSpace SaaS.',
    content: `
      <h1>CollabSpace Design System</h1>
      <p>Design guidelines establishing our clean aesthetic: neutral slate surfaces, high-contrast dark accents, and indigo/violet focus highlights.</p>
      <h2>Guiding Principles</h2>
      <p>Clarity over decoration. Speed over excessive animation. Predictability in every interaction.</p>
    `,
    updatedAt: 'Yesterday at 4:15 PM',
    createdAt: 'Sep 28, 2026',
    author: CURRENT_USER,
    collaborators: [MOCK_COLLABORATORS[1]],
    tags: ['Design', 'UI/UX'],
    isStarred: false,
  },
  {
    id: 'doc-security-audit',
    title: 'Security Architecture & Data Encryption at Rest',
    icon: '🛡️',
    excerpt: 'Comprehensive overview of AES-256 document snapshot encryption, TLS 1.3 transport, and session token rotation.',
    content: `
      <h1>Security Architecture Specification</h1>
      <p>Overview of tenant isolation, customer-managed encryption keys (CMEK), and automated audit logs for collaborative workspaces.</p>
    `,
    updatedAt: '3 days ago',
    createdAt: 'Sep 15, 2026',
    author: MOCK_COLLABORATORS[1],
    collaborators: [CURRENT_USER],
    tags: ['Security', 'Infra'],
    isStarred: false,
  },
  {
    id: 'doc-weekly-standup',
    title: 'Weekly Engineering Standup Notes & Blockers',
    icon: '📋',
    excerpt: 'Synchronous notes, pull request approvals, and deploy schedules across frontend and infrastructure squads.',
    content: `
      <h1>Weekly Engineering Sync</h1>
      <p>Sprint 42 updates, blocker triage, and deployment windows for the upcoming release candidate.</p>
    `,
    updatedAt: 'Oct 17, 2026',
    createdAt: 'Oct 17, 2026',
    author: CURRENT_USER,
    collaborators: [MOCK_COLLABORATORS[0], MOCK_COLLABORATORS[1], MOCK_COLLABORATORS[2]],
    tags: ['Meetings', 'Engineering'],
    isStarred: false,
    isDeleted: false,
  },
  {
    id: 'doc-trash-legacy',
    title: 'Deprecated WebSocket Proto v1 & Framing Spec',
    icon: '🗑️',
    excerpt: 'Obsolete raw JSON framing protocol replaced by binary Yjs delta encoding in v2 engine.',
    content: `
      <h1>Deprecated WebSocket Proto v1</h1>
      <p>This draft is kept for archival audit references. Replaced by binary CRDT deltas.</p>
    `,
    updatedAt: '3 days ago',
    createdAt: 'Sep 01, 2026',
    author: CURRENT_USER,
    collaborators: [MOCK_COLLABORATORS[1]],
    tags: ['Deprecated', 'Legacy'],
    isStarred: false,
    isDeleted: true,
    deletedAt: '3 days ago',
  },
];

export const MOCK_COMMENTS: CommentItem[] = [
  {
    id: 'cmt-1',
    documentId: 'doc-prd-sync',
    author: MOCK_COLLABORATORS[0], // Sarah Chen
    text: 'Should we specify fallback mechanisms if WebSocket drops during high-frequency typing?',
    createdAt: '25 minutes ago',
    resolved: false,
    selectedTextSnippet: 'Sub-50ms Local Echo: Keystrokes must immediately mutate local DOM',
    replies: [
      {
        id: 'rep-1',
        author: CURRENT_USER,
        text: 'Good point Sarah! The client will buffer local Yjs transactions in memory and replay them automatically upon socket handshake.',
        createdAt: '18 minutes ago',
      },
    ],
  },
  {
    id: 'cmt-2',
    documentId: 'doc-prd-sync',
    author: MOCK_COLLABORATORS[1], // Marcus Brody
    text: 'Can we include benchmark metrics for documents over 50,000 words?',
    createdAt: '1 hour ago',
    resolved: false,
    selectedTextSnippet: 'Integrate Yjs byte-level delta compression',
    replies: [],
  },
  {
    id: 'cmt-3',
    documentId: 'doc-prd-sync',
    author: CURRENT_USER,
    text: 'Confirmed with DevOps: staging Redis cluster is ready for pub/sub benchmarking.',
    createdAt: 'Yesterday',
    resolved: true,
    selectedTextSnippet: 'WebRTC and WebSocket transport fallbacks',
    replies: [],
  },
];

export const MOCK_VERSIONS: VersionEntry[] = [
  {
    id: 'ver-current',
    documentId: 'doc-prd-sync',
    versionNumber: 'v2.4 (Current)',
    timestamp: 'Just now',
    author: CURRENT_USER,
    summary: 'Updated executive summary and refined latency target metrics.',
    changes: { added: 14, removed: 3 },
    contentSnapshot: '',
  },
  {
    id: 'ver-prev-1',
    documentId: 'doc-prd-sync',
    versionNumber: 'v2.3',
    timestamp: '2 hours ago',
    author: MOCK_COLLABORATORS[0],
    summary: 'Added offline buffering requirements and persistence notes.',
    changes: { added: 32, removed: 8 },
    contentSnapshot: '',
  },
  {
    id: 'ver-prev-2',
    documentId: 'doc-prd-sync',
    versionNumber: 'v2.2',
    timestamp: 'Yesterday at 3:30 PM',
    author: MOCK_COLLABORATORS[1],
    summary: 'Restructured milestones and technical architecture section.',
    changes: { added: 19, removed: 12 },
    contentSnapshot: '',
  },
  {
    id: 'ver-init',
    documentId: 'doc-prd-sync',
    versionNumber: 'v1.0',
    timestamp: 'Oct 14, 2026',
    author: CURRENT_USER,
    summary: 'Initial document draft created from PRD template.',
    changes: { added: 48, removed: 0 },
    contentSnapshot: '',
  },
];

export const MOCK_WORKSPACE_MEMBERS: WorkspaceMember[] = [
  {
    id: 'mem-1',
    user: CURRENT_USER,
    role: 'owner',
    joinedAt: 'Aug 2026',
  },
  {
    id: 'mem-2',
    user: MOCK_COLLABORATORS[0],
    role: 'admin',
    joinedAt: 'Sep 2026',
  },
  {
    id: 'mem-3',
    user: MOCK_COLLABORATORS[1],
    role: 'editor',
    joinedAt: 'Sep 2026',
  },
  {
    id: 'mem-4',
    user: MOCK_COLLABORATORS[2],
    role: 'viewer',
    joinedAt: 'Oct 2026',
  },
];
