'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { CopyIcon, CheckIcon, UsersIcon, ShieldIcon } from '../ui/icons';
import { User } from '@/lib/types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  collaborators: User[];
  onInvite: (email: string, role: string) => Promise<void> | void;
  workspaceName?: string;
  owner?: {
    id?: string;
    name: string;
    email: string;
    avatar?: string;
    role?: string;
  };
  currentUser?: {
    id?: string;
    name: string;
    email: string;
    avatar?: string;
  };
  isInviting?: boolean;
}

export function ShareModal({
  isOpen,
  onClose,
  documentTitle,
  collaborators,
  onInvite,
  workspaceName = 'CollabSpace Workspace',
  owner,
  currentUser,
  isInviting = false,
}: ShareModalProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');
  const [copied, setCopied] = useState(false);
  const [permissionType, setPermissionType] = useState<'workspace' | 'public'>('workspace');

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes('@') || isInviting) return;
    const emailToInvite = inviteEmail.trim();
    await onInvite(emailToInvite, inviteRole);
    setInviteEmail('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Document"
      description={`Collaborate on "${documentTitle}" with team members or generate a shareable link.`}
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Invite Form */}
        <form onSubmit={handleInviteSubmit} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={isInviting}
            placeholder="colleague@company.com"
            className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'editor' | 'commenter' | 'viewer')}
            disabled={isInviting}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:cursor-not-allowed"
          >
            <option value="editor">Can edit</option>
            <option value="commenter">Can comment</option>
            <option value="viewer">Can view</option>
          </select>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!inviteEmail.trim() || isInviting}
            isLoading={isInviting}
          >
            {isInviting ? 'Inviting...' : 'Invite'}
          </Button>
        </form>

        {/* Link Sharing Row */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-2xs">
              <UsersIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-slate-800 truncate">
                {permissionType === 'workspace'
                  ? `Anyone in ${workspaceName} with link`
                  : 'Public access enabled'}
              </p>
              <p className="text-[11px] text-slate-500">
                {permissionType === 'workspace' ? 'Can view & comment' : 'Anyone on the web with link can view'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={permissionType}
              onChange={(e) => setPermissionType(e.target.value as 'workspace' | 'public')}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
            >
              <option value="workspace">Workspace</option>
              <option value="public">Public link</option>
            </select>

            <Button
              variant="outline"
              size="xs"
              onClick={handleCopyLink}
              leftIcon={copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-600" /> : <CopyIcon className="w-3.5 h-3.5" />}
            >
              <span>{copied ? 'Copied!' : 'Copy link'}</span>
            </Button>
          </div>
        </div>

        {/* Existing People with Access */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            People with access ({(owner ? 1 : 0) + collaborators.length})
          </h4>
          <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
            {/* Owner Row */}
            {owner && (
              <div className="py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  {owner.avatar ? (
                    <img
                      src={owner.avatar}
                      alt={owner.name}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {owner.name
                        ? owner.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'OW'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {owner.name}
                      {currentUser &&
                      (currentUser.id === owner.id ||
                        (currentUser.email &&
                          owner.email &&
                          currentUser.email.toLowerCase() === owner.email.toLowerCase()))
                        ? ' (You)'
                        : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{owner.email}</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize shrink-0 ml-2">
                  {owner.role || 'Owner'}
                </span>
              </div>
            )}

            {/* Collaborators */}
            {collaborators.map((c) => {
              const isYou = Boolean(
                currentUser &&
                  (currentUser.id === c.id ||
                    (currentUser.email &&
                      c.email &&
                      currentUser.email.toLowerCase() === c.email.toLowerCase()))
              );
              return (
                <div key={c.id || c.email} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.color || '#6366F1' }}
                      >
                        {c.name ? c.name[0].toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {c.name}
                        {isYou ? ' (You)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{c.email}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-600 capitalize bg-slate-50 border border-slate-200 px-2 py-0.5 rounded shrink-0 ml-2">
                    {c.role}
                  </span>
                </div>
              );
            })}

            {!owner && collaborators.length === 0 && (
              <p className="py-2 text-[11px] text-slate-400 italic">No team members with access yet.</p>
            )}
          </div>
        </div>

        {/* RBAC Info */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[11px] text-indigo-900 flex items-start gap-2">
          <ShieldIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <span>
            RBAC Permission Tiers: Editor (can view, comment & edit), Commenter (can view & comment), Viewer (read-only). Access permissions are strictly enforced at API and WebSocket protocol levels.
          </span>
        </div>
      </div>
    </Modal>
  );
}
