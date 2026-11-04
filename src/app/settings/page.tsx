'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Workspace, WorkspaceMember } from '@/lib/types';
import {
  LogoIcon,
  ArrowLeftIcon,
  SettingsIcon,
  UsersIcon,
  ShieldIcon,
  CheckIcon,
  TrashIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
  CloseIcon,
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { CreateWorkspaceModal } from '@/components/dashboard/create-workspace-modal';
import { WorkspaceSwitcher } from '@/components/dashboard/workspace-switcher';
import { useToast } from '@/components/ui/toast';

type Tab = 'general' | 'members' | 'roles' | 'account';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error } = useToast();

  const initialTab = (searchParams.get('tab') as Tab) || 'general';
  const requestedWorkspaceId = searchParams.get('workspaceId');

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [isLoading, setIsLoading] = useState(true);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'>('owner');

  // General Settings state
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceIcon, setWorkspaceIcon] = useState('🚀');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalError, setGeneralError] = useState('');

  // Members state
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'commenter' | 'viewer'>('editor');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Account state
  const [currentUserId, setCurrentUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyComments, setNotifyComments] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Workspace creation modal
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);

  // Generic Confirm Modal
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    isLoading?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {},
  });

  // Load auth user and workspaces
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const [meRes, wsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/workspaces'),
        ]);

        if (!meRes.ok) {
          router.push('/login');
          return;
        }

        const meData = await meRes.json();
        const wsData = await wsRes.json();

        if (!isMounted) return;

        if (meData.authenticated && meData.user) {
          setCurrentUserId(meData.user.id);
          setUserName(meData.user.name);
          setUserEmail(meData.user.email);
        }

        if (wsData.workspaces && wsData.workspaces.length > 0) {
          const list: Workspace[] = wsData.workspaces.map((ws: Workspace) => ({
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
            icon: ws.icon || '🚀',
            plan: ws.plan || 'Free',
            membersCount: ws.membersCount || 1,
            documentCount: ws.documentCount || 0,
            role: ws.role || 'viewer',
          }));
          setWorkspaces(list);

          const matching = requestedWorkspaceId
            ? list.find((w) => w.id === requestedWorkspaceId)
            : null;
          const target = matching || list[0];
          setActiveWorkspace(target);
          setWorkspaceName(target.name);
          setWorkspaceSlug(target.slug);
          setWorkspaceIcon(target.icon);
          setUserRole(target.role || 'owner');
        }
      } catch (err) {
        console.error('Failed to load settings data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initialize();
    return () => {
      isMounted = false;
    };
  }, [router, requestedWorkspaceId]);

  // Load members and details whenever activeWorkspace changes
  useEffect(() => {
    if (!activeWorkspace?.id) return;

    let isMounted = true;
    async function fetchWorkspaceData() {
      setIsLoadingMembers(true);
      try {
        const [detailsRes, membersRes] = await Promise.all([
          fetch(`/api/workspaces/${activeWorkspace?.id}`),
          fetch(`/api/workspaces/${activeWorkspace?.id}/members`),
        ]);

        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (isMounted && detailsData.workspace) {
            setWorkspaceName(detailsData.workspace.name);
            setWorkspaceSlug(detailsData.workspace.slug);
            setWorkspaceIcon(detailsData.workspace.icon);
            setUserRole(detailsData.workspace.role || 'viewer');
          }
        }

        if (membersRes.ok) {
          const membersData = await membersRes.json();
          if (isMounted && membersData.members) {
            setMembers(membersData.members);
          }
        }
      } catch (err) {
        console.error('Failed to load workspace members:', err);
      } finally {
        if (isMounted) setIsLoadingMembers(false);
      }
    }

    fetchWorkspaceData();
    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id]);

  // Handle Workspace Switch
  const handleSelectWorkspace = (ws: Workspace) => {
    setActiveWorkspace(ws);
    setWorkspaceName(ws.name);
    setWorkspaceSlug(ws.slug);
    setWorkspaceIcon(ws.icon);
    setUserRole(ws.role || 'viewer');
  };

  // Handle Create Workspace
  const handleCreateWorkspace = async (name: string, icon: string) => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon }),
      });

      if (res.ok) {
        const data = await res.json();
        const newWs: Workspace = {
          id: data.workspace.id,
          name: data.workspace.name,
          slug: data.workspace.slug,
          icon: data.workspace.icon,
          membersCount: 1,
          documentCount: 0,
          plan: 'Free',
          role: 'owner',
        };
        setWorkspaces((prev) => [...prev, newWs]);
        handleSelectWorkspace(newWs);
        success(`Workspace "${newWs.name}" created!`);
        setIsCreateWorkspaceModalOpen(false);
      } else {
        const data = await res.json();
        error(data.error || 'Failed to create workspace.');
      }
    } catch {
      error('Network error creating workspace.');
    }
  };

  // Handle Save General Workspace Settings
  const handleSaveWorkspaceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;

    setIsSavingGeneral(true);
    setGeneralError('');

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName,
          slug: workspaceSlug,
          icon: workspaceIcon,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGeneralError(data.error || 'Failed to update workspace.');
        error(data.error || 'Failed to update workspace.');
        return;
      }

      success('Workspace settings updated successfully!');
      const updatedWs: Workspace = {
        ...activeWorkspace,
        name: workspaceName,
        slug: workspaceSlug,
        icon: workspaceIcon,
      };
      setActiveWorkspace(updatedWs);
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === updatedWs.id ? updatedWs : w))
      );
    } catch {
      setGeneralError('Network error updating workspace.');
      error('Network error updating workspace.');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Handle Delete Workspace
  const handleDeleteWorkspace = () => {
    if (!activeWorkspace) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete this workspace?',
      description: `Are you sure you want to delete "${activeWorkspace.name}"? All documents, member associations, and content will be permanently removed. This cannot be undone.`,
      confirmText: 'Delete Permanently',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            success(`Workspace "${activeWorkspace.name}" deleted.`);
            const remaining = workspaces.filter((w) => w.id !== activeWorkspace.id);
            setWorkspaces(remaining);
            if (remaining.length > 0) {
              handleSelectWorkspace(remaining[0]);
            } else {
              router.push('/dashboard');
            }
          } else {
            const data = await res.json();
            error(data.error || 'Failed to delete workspace.');
          }
        } catch {
          error('Network error deleting workspace.');
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Handle Leave Workspace (for non-owners)
  const handleLeaveWorkspace = () => {
    if (!activeWorkspace) return;

    const myMembership = members.find((m) => m.user.id === currentUserId);
    if (!myMembership) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Leave this workspace?',
      description: `Are you sure you want to leave "${activeWorkspace.name}"? You will lose access to all documents within this workspace.`,
      confirmText: 'Leave Workspace',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/workspaces/${activeWorkspace.id}/members/${myMembership.id}`,
            { method: 'DELETE' }
          );

          if (res.ok) {
            success(`You left "${activeWorkspace.name}".`);
            const remaining = workspaces.filter((w) => w.id !== activeWorkspace.id);
            setWorkspaces(remaining);
            if (remaining.length > 0) {
              handleSelectWorkspace(remaining[0]);
            } else {
              router.push('/dashboard');
            }
          } else {
            const data = await res.json();
            error(data.error || 'Failed to leave workspace.');
          }
        } catch {
          error('Network error leaving workspace.');
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Handle Invite Member
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    setIsInviting(true);
    setInviteError('');

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to invite member.');
        return;
      }

      success(`Invited ${inviteEmail} as ${inviteRole}.`);
      setMembers((prev) => [...prev, data.member]);
      setInviteEmail('');
      setIsInviteModalOpen(false);
    } catch {
      setInviteError('Network error inviting member.');
    } finally {
      setIsInviting(false);
    }
  };

  // Handle Change Member Role
  const handleChangeMemberRole = async (
    memberId: string,
    newRole: 'admin' | 'editor' | 'commenter' | 'viewer'
  ) => {
    if (!activeWorkspace) return;

    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/members/${memberId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId ? { ...m, role: data.member.role } : m
          )
        );
        success('Member role updated.');
      } else {
        const data = await res.json();
        error(data.error || 'Failed to update member role.');
      }
    } catch {
      error('Network error updating member role.');
    }
  };

  // Handle Remove Member
  const handleRemoveMember = (member: WorkspaceMember) => {
    if (!activeWorkspace) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Remove team member?',
      description: `Remove ${member.user.name} (${member.user.email}) from "${activeWorkspace.name}"? They will immediately lose access.`,
      confirmText: 'Remove Member',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/workspaces/${activeWorkspace.id}/members/${member.id}`,
            { method: 'DELETE' }
          );

          if (res.ok) {
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
            success(`${member.user.name} removed from workspace.`);
          } else {
            const data = await res.json();
            error(data.error || 'Failed to remove member.');
          }
        } catch {
          error('Network error removing member.');
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Account Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(false);
    setProfileError('');

    try {
      const res = await fetch('/api/account/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || 'Failed to update profile.');
        return;
      }

      setProfileSuccess(true);
      success('Profile display name updated!');
      setTimeout(() => setProfileSuccess(false), 2500);
    } catch {
      setProfileError('Network error updating profile.');
    }
  };

  // Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);

    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || 'Failed to change password.');
        return;
      }

      setPasswordSuccess('Password changed successfully! Other sessions have been signed out.');
      success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setPasswordError('Network error changing password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    router.push('/login');
  };

  // Filter members
  const filteredMembers = members.filter(
    (m) =>
      m.user.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.user.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.role.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const canEditWorkspace = userRole === 'owner' || userRole === 'admin';
  const isOwner = userRole === 'owner';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading workspace settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <Link href="/" className="flex items-center gap-2 group">
            <LogoIcon className="w-6 h-6 rounded-lg" />
            <span className="font-extrabold text-base tracking-tight">
              Collab<span className="text-indigo-600">Space</span>
            </span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">Settings</span>
        </div>

        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            Back to Dashboard
          </Button>
        </Link>
      </header>

      {/* Main Settings Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-8">
        {/* Settings Navigation Tabs */}
        <aside className="w-full md:w-64 shrink-0 space-y-4">
          {/* Active Workspace Switcher */}
          {activeWorkspace && (
            <div className="space-y-1.5">
              <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Workspace
              </div>
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                onSelectWorkspace={handleSelectWorkspace}
                onCreateWorkspace={() => setIsCreateWorkspaceModalOpen(true)}
              />
            </div>
          )}

          <div className="space-y-1 pt-2">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Workspace Configuration
            </div>

            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === 'general'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <SettingsIcon className="w-4 h-4 shrink-0 text-slate-500" />
              <span>General Settings</span>
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === 'members'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <UsersIcon className="w-4 h-4 shrink-0 text-slate-500" />
                <span>Members & Access</span>
              </div>
              <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                {members.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('roles')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === 'roles'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldIcon className="w-4 h-4 shrink-0 text-slate-500" />
              <span>Roles & Permissions</span>
            </button>

            <div className="pt-4 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              User Account
            </div>

            <button
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === 'account'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">
                {userName ? userName.charAt(0).toUpperCase() : 'U'}
              </div>
              <span>Profile & Security</span>
            </button>
          </div>

          {/* Quick info card */}
          {activeWorkspace && (
            <div className="pt-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Your Role</span>
                  <span className="capitalize px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                    {userRole}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Total Documents</span>
                  <span className="font-semibold text-slate-700">
                    {activeWorkspace.documentCount || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Plan</span>
                  <span className="font-semibold text-slate-700">{activeWorkspace.plan}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Tab Content Panes */}
        <main className="flex-1 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8">
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">General Workspace Settings</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure workspace identity, URL slug, and access controls for{' '}
                  <span className="font-semibold text-slate-800">{activeWorkspace?.name}</span>.
                </p>
              </div>

              {!canEditWorkspace && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  <p className="font-semibold">View-Only Permissions</p>
                  <p className="text-amber-700 mt-0.5">
                    You have <span className="capitalize font-bold">{userRole}</span> permissions.
                    Only workspace owners and administrators can modify workspace details.
                  </p>
                </div>
              )}

              {generalError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {generalError}
                </div>
              )}

              <form onSubmit={handleSaveWorkspaceSettings} className="space-y-5">
                <div>
                  <label htmlFor="ws-name" className="block text-xs font-semibold text-slate-700">
                    Workspace Name
                  </label>
                  <input
                    id="ws-name"
                    type="text"
                    disabled={!canEditWorkspace}
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                    className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label htmlFor="ws-slug" className="block text-xs font-semibold text-slate-700">
                    Workspace URL Slug
                  </label>
                  <div className="mt-1 flex items-center max-w-md rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-400 select-none text-xs">collabspace.dev/</span>
                    <input
                      id="ws-slug"
                      type="text"
                      disabled={!canEditWorkspace}
                      value={workspaceSlug}
                      onChange={(e) => setWorkspaceSlug(e.target.value)}
                      required
                      className="w-full bg-transparent text-slate-900 font-medium focus:outline-none pl-1 disabled:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Workspace Avatar Icon
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-2xl flex items-center justify-center shadow-2xs">
                      {workspaceIcon}
                    </span>
                    {canEditWorkspace && (
                      <div className="flex flex-wrap gap-2">
                        {['🚀', '⚡', '🎨', '📚', '💡', '🏢', '🔬', '🌐', '📊', '🛠️'].map(
                          (emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              onClick={() => setWorkspaceIcon(emoji)}
                              className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center border transition-all cursor-pointer ${
                                workspaceIcon === emoji
                                  ? 'border-indigo-600 bg-indigo-50 shadow-xs'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              {emoji}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {canEditWorkspace && (
                  <div className="pt-2">
                    <Button type="submit" variant="primary" disabled={isSavingGeneral}>
                      {isSavingGeneral ? 'Saving...' : 'Save Workspace Changes'}
                    </Button>
                  </div>
                )}
              </form>

              {/* Danger Zone */}
              <div className="pt-6 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider">
                  Danger Zone
                </h3>

                {isOwner ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-rose-950">Delete this workspace</h4>
                      <p className="text-xs text-rose-800 mt-0.5">
                        Permanently erases all documents, comments, and member associations in{' '}
                        <span className="font-bold">{activeWorkspace?.name}</span>.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-rose-300 text-rose-700 hover:bg-rose-100 self-start sm:self-auto shrink-0"
                      onClick={handleDeleteWorkspace}
                    >
                      Delete Workspace
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-amber-950">Leave this workspace</h4>
                      <p className="text-xs text-amber-800 mt-0.5">
                        You will immediately lose access to documents and collaboration in{' '}
                        <span className="font-bold">{activeWorkspace?.name}</span>.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-amber-300 text-amber-800 hover:bg-amber-100 self-start sm:self-auto shrink-0"
                      onClick={handleLeaveWorkspace}
                    >
                      Leave Workspace
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERS & INVITATIONS */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Members & Invitations</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage team permissions and invite collaborators to{' '}
                    <span className="font-semibold text-slate-800">{activeWorkspace?.name}</span>.
                  </p>
                </div>

                {canEditWorkspace && (
                  <Button
                    onClick={() => {
                      setInviteError('');
                      setIsInviteModalOpen(true);
                    }}
                    variant="primary"
                    size="sm"
                    leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                  >
                    Invite Member
                  </Button>
                )}
              </div>

              {/* Search Member Filter */}
              <div className="max-w-md">
                <input
                  type="text"
                  placeholder="Filter members by name, email, or role..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Members Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                {isLoadingMembers ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-2" />
                    Loading workspace members...
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No members match your search criteria.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-4">User</th>
                        <th className="py-2.5 px-4">Role</th>
                        <th className="py-2.5 px-4 hidden sm:table-cell">Joined</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMembers.map((member) => {
                        const isMe = member.user.id === currentUserId;
                        const isWorkspaceOwner = member.role === 'owner';

                        return (
                          <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0"
                                  style={{ backgroundColor: member.user.color || '#6366F1' }}
                                >
                                  {member.user.name
                                    ? member.user.name
                                        .split(' ')
                                        .map((n) => n[0])
                                        .join('')
                                    : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                                    <span>{member.user.name}</span>
                                    {isMe && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                                        You
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {member.user.email}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {isWorkspaceOwner ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                                  Owner
                                </span>
                              ) : canEditWorkspace && !isMe ? (
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    handleChangeMemberRole(
                                      member.id,
                                      e.target.value as 'admin' | 'editor' | 'commenter' | 'viewer'
                                    )
                                  }
                                  className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  {isOwner && <option value="admin">Admin</option>}
                                  <option value="editor">Editor</option>
                                  <option value="commenter">Commenter</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              ) : (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                                    member.role === 'admin'
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : member.role === 'editor'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : member.role === 'commenter'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {member.role}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-slate-500 hidden sm:table-cell">
                              {member.joinedAt
                                ? new Date(member.joinedAt).toLocaleDateString()
                                : 'Active'}
                            </td>

                            <td className="py-3 px-4 text-right">
                              {isWorkspaceOwner ? (
                                <span className="text-[11px] text-slate-400 italic">
                                  Workspace Owner
                                </span>
                              ) : isMe ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:bg-rose-50 text-xs px-2 py-1"
                                  onClick={handleLeaveWorkspace}
                                >
                                  Leave
                                </Button>
                              ) : canEditWorkspace ? (
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                                  title="Remove member"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ROLES & PERMISSIONS MATRIX */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Roles & Permissions Matrix</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Granular capabilities enforced by the server for each role within CollabSpace.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-4">Capability</th>
                      <th className="py-2.5 px-3 text-center">Owner</th>
                      <th className="py-2.5 px-3 text-center">Admin</th>
                      <th className="py-2.5 px-3 text-center">Editor</th>
                      <th className="py-2.5 px-3 text-center">Viewer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      { cap: 'Read & view documents', owner: true, admin: true, editor: true, viewer: true },
                      { cap: 'Leave comments & mentions', owner: true, admin: true, editor: true, viewer: true },
                      { cap: 'Edit rich-text document content', owner: true, admin: true, editor: true, viewer: false },
                      { cap: 'Create new documents', owner: true, admin: true, editor: true, viewer: false },
                      { cap: 'Archive, restore, & move documents', owner: true, admin: true, editor: true, viewer: false },
                      { cap: 'Invite new workspace members', owner: true, admin: true, editor: false, viewer: false },
                      { cap: 'Modify workspace member roles', owner: true, admin: true, editor: false, viewer: false },
                      { cap: 'Delete documents permanently', owner: true, admin: true, editor: false, viewer: false },
                      { cap: 'Delete workspace & danger zone', owner: true, admin: false, editor: false, viewer: false },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{row.cap}</td>
                        <td className="py-2.5 px-3 text-center">
                          {row.owner ? (
                            <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.admin ? (
                            <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.editor ? (
                            <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.viewer ? (
                            <CheckIcon className="w-4 h-4 text-emerald-600 mx-auto" />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ACCOUNT & PROFILE */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Profile & Security Settings</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Manage your personal user profile, notifications, and credentials.
                </p>
              </div>

              {profileSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Account profile updated!</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-indigo-600 text-white font-bold text-lg flex items-center justify-center ring-4 ring-indigo-50">
                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{userName}</h3>
                    <p className="text-xs text-slate-400">{userEmail}</p>
                    <span className="mt-1 inline-block text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold uppercase">
                      CollabSpace User
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <label htmlFor="usr-name" className="block text-xs font-semibold text-slate-700">
                      Display Name
                    </label>
                    <input
                      id="usr-name"
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="usr-email" className="block text-xs font-semibold text-slate-700">
                      Email Address
                    </label>
                    <input
                      id="usr-email"
                      type="email"
                      disabled
                      value={userEmail}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-500"
                    />
                  </div>
                </div>

                {/* Theme Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Interface Theme
                  </label>
                  <div className="flex gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => setThemeMode('light')}
                      className={`flex-1 p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        themeMode === 'light'
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <SunIcon className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Light Theme</p>
                        <p className="text-[10px] text-slate-500">Default production style</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThemeMode('dark')}
                      className={`flex-1 p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        themeMode === 'dark'
                          ? 'border-indigo-600 bg-slate-900 text-white shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <MoonIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Dark Theme</p>
                        <p className="text-[10px] text-slate-400">Optional sleek contrast</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Notification preferences */}
                <div className="space-y-2 pt-2 max-w-md">
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Notifications
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyMentions}
                      onChange={(e) => setNotifyMentions(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Direct @mentions in documents</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyComments}
                      onChange={(e) => setNotifyComments(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>New comments on my documents</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyDigest}
                      onChange={(e) => setNotifyDigest(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Weekly workspace summary digest</span>
                  </label>
                </div>

                {profileError && (
                  <p className="text-xs text-rose-600 font-medium">{profileError}</p>
                )}

                <div className="pt-2">
                  <Button type="submit" variant="primary">
                    Update Profile
                  </Button>
                </div>
              </form>

              {/* Password Change Section */}
              <div className="pt-8 border-t border-slate-200">
                <h3 className="text-base font-bold text-slate-900">Change Password</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Ensure your account uses a strong password of at least 8 characters. Changing your password revokes other active sessions.
                </p>

                {passwordSuccess && (
                  <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {passwordError && (
                  <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                    {passwordError}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="mt-4 space-y-4 max-w-md">
                  <div>
                    <label htmlFor="cur-pass" className="block text-xs font-semibold text-slate-700">
                      Current Password
                    </label>
                    <input
                      id="cur-pass"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-pass" className="block text-xs font-semibold text-slate-700">
                      New Password
                    </label>
                    <input
                      id="new-pass"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="At least 8 characters"
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-new-pass" className="block text-xs font-semibold text-slate-700">
                      Confirm New Password
                    </label>
                    <input
                      id="confirm-new-pass"
                      type="password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      placeholder="Re-enter new password"
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <Button type="submit" variant="primary" disabled={isChangingPassword}>
                    {isChangingPassword ? 'Updating Password...' : 'Change Password'}
                  </Button>
                </form>
              </div>

              {/* Session / Sign Out Section */}
              <div className="pt-8 border-t border-slate-200">
                <h3 className="text-base font-bold text-slate-900">Session & Authentication</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sign out of your CollabSpace account on this device.
                </p>

                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignOut}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Sign Out of CollabSpace
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Invite Team Member</h3>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4">
              {inviteError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {inviteError}
                </div>
              )}

              <div>
                <label htmlFor="inv-email" className="block text-xs font-semibold text-slate-700">
                  Colleague Work Email
                </label>
                <input
                  id="inv-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign Workspace Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'commenter' | 'viewer')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="editor">Editor — Can create and edit docs</option>
                  <option value="commenter">Commenter — Can read and add comments</option>
                  {isOwner && <option value="admin">Admin — Can manage members & settings</option>}
                  <option value="viewer">Viewer — Read-only access</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="text-xs"
                  disabled={isInviting}
                  leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                >
                  {isInviting ? 'Inviting...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceModalOpen}
        onClose={() => setIsCreateWorkspaceModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalConfig.onConfirm}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        confirmText={confirmModalConfig.confirmText}
        variant={confirmModalConfig.variant}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
