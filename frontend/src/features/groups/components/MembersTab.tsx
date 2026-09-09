import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { formatDate } from "../../../lib/format";
import { getErrorMessage } from "../../../services/api";
import {
  changeMemberRole,
  listGroupMembers,
  removeMember,
  transferOwnership,
  type GroupRole,
  type ManageableRole,
  type PublicGroupMember,
} from "../api/groupsApi";
import { InviteMemberForm } from "./InviteMemberForm";

const isPrivileged = (role: GroupRole | null | undefined): boolean =>
  role === "owner" || role === "admin";

function roleBadge(role: GroupRole): string {
  switch (role) {
    case "owner":
      return "badge--accent";
    case "admin":
      return "badge--success";
    default:
      return "badge--muted";
  }
}

interface MembersTabProps {
  groupId: string;
  myRole: GroupRole | null;
  currentUserId: string | null;
  reloadKey: number;
  onGroupChanged: () => void;
}

type ConfirmKind = "remove" | "leave" | "transfer";

interface ConfirmState {
  kind: ConfirmKind;
  target: PublicGroupMember;
}

export function MembersTab({
  groupId,
  myRole,
  currentUserId,
  reloadKey,
  onGroupChanged,
}: MembersTabProps) {
  const [members, setMembers] = useState<PublicGroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const privileged = isPrivileged(myRole);
  const mine = (member: PublicGroupMember): boolean => member.userId === currentUserId;

  const load = useCallback(async () => {
    setError(null);
    setMembers(null);
    try {
      setMembers(await listGroupMembers(groupId));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setActionError(null);
    setDone(null);
    try {
      await action();
      setDone(successMessage);
    } catch (actionFailure) {
      setActionError(getErrorMessage(actionFailure));
    }
  };

  const handleRemove = async (target: PublicGroupMember) => {
    setBusyId(target.userId);
    await runAction(
      () => removeMember(groupId, target.userId),
      target.userId === currentUserId ? "You left the group." : `${target.name} was removed.`,
    );
    setBusyId(null);
    setConfirm(null);
    onGroupChanged();
  };

  const handleRoleChange = async (target: PublicGroupMember, role: ManageableRole) => {
    setBusyId(target.userId);
    await runAction(() => changeMemberRole(groupId, target.userId, role), `${target.name} is now ${role}.`);
    setBusyId(null);
    onGroupChanged();
  };

  const handleTransfer = async (target: PublicGroupMember) => {
    setBusyId(target.userId);
    await runAction(() => transferOwnership(groupId, target.userId), `Ownership transferred to ${target.name}.`);
    setBusyId(null);
    setConfirm(null);
    onGroupChanged();
  };

  const confirmDialogCopy = (): { title: string; message: string } => {
    if (!confirm) {
      return { title: "", message: "" };
    }
    const target = confirm.target;
    switch (confirm.kind) {
      case "remove":
        return {
          title: `Remove ${target.name}?`,
          message: `They will lose access to this group and its balances and history.`,
        };
      case "leave":
        return {
          title: "Leave this group?",
          message: "You will be removed from the group. Your past contributions stay recorded in its history.",
        };
      case "transfer":
        return {
          title: `Transfer ownership to ${target.name}?`,
          message: "You will become an admin and will no longer be able to archive the group or manage roles.",
        };
    }
  };

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!members) {
    return <Spinner label="Loading members" />;
  }

  if (members.length === 0) {
    return <EmptyState title="No members yet" />;
  }

  const targetRoles: ManageableRole[] = ["member", "admin"];

  return (
    <div>
      {privileged && (
        <div className="members-toolbar">
          <button
            className="btn btn--sm"
            type="button"
            onClick={() => setInviting((value) => !value)}
          >
            {inviting ? "Close invite" : "Invite member"}
          </button>
          {inviting && (
            <InviteMemberForm
              groupId={groupId}
              existingMemberIds={members.filter((m) => m.status !== "declined").map((m) => m.userId)}
              onInvited={() => {
                setInviting(false);
                onGroupChanged();
              }}
            />
          )}
        </div>
      )}

      {actionError && <Banner tone="error">{actionError}</Banner>}
      {done && <Banner tone="success">{done}</Banner>}

      <ul className="rows">
        {members.map((member) => {
          const isMe = mine(member);
          const isOwner = member.role === "owner";
          const active = member.status === "active";

          const isOwnerViewer = myRole === "owner";
          const canRemove = active && !isOwner && !isMe && privileged;
          const canRoleChange = active && !isOwner && !isMe && isOwnerViewer;
          const canTransfer = active && !isOwner && !isMe && isOwnerViewer;
          const canLeave = active && isMe && !isOwner;
          const canCancelInvite = !active && member.status !== "declined" && privileged;

          return (
            <li key={member.userId} className="row">
              <div>
                <p className="row__primary">
                  {member.name}
                  {isMe && <span className="badge badge--accent badge--inline">you</span>}
                </p>
                <p className="row__secondary">{member.email}</p>
              </div>
              <div className="row__meta members-actions">
                {active ? (
                  <span className={`badge ${roleBadge(member.role)}`}>{member.role}</span>
                ) : (
                  <span className="badge badge--muted">{member.status}</span>
                )}
                {active && <p className="members-actions__since">since {formatDate(member.joinedAt)}</p>}
                {canRemove && (
                  <div className="members-actions__buttons">
                    {canRoleChange &&
                      targetRoles.map((role) =>
                        role !== member.role ? (
                          <button
                            key={role}
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={busyId !== null}
                            onClick={() => void handleRoleChange(member, role)}
                          >
                            Make {role}
                          </button>
                        ) : null,
                      )}
                    {canTransfer && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busyId !== null}
                        onClick={() => setConfirm({ kind: "transfer", target: member })}
                      >
                        Transfer ownership
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={busyId !== null}
                      onClick={() => setConfirm({ kind: "remove", target: member })}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {canLeave && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busyId !== null}
                    onClick={() => setConfirm({ kind: "leave", target: member })}
                  >
                    Leave group
                  </button>
                )}
                {canCancelInvite && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busyId !== null}
                    onClick={() => setConfirm({ kind: "remove", target: member })}
                  >
                    Cancel invitation
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {confirm && (
        <ConfirmDialog
          open
          title={confirmDialogCopy().title}
          message={confirmDialogCopy().message}
          confirmLabel={confirm.kind === "transfer" ? "Transfer" : confirm.kind === "leave" ? "Leave group" : "Remove"}
          busy={busyId !== null}
          onConfirm={() => {
            if (confirm.kind === "remove") {
              void handleRemove(confirm.target);
            } else if (confirm.kind === "leave") {
              void handleRemove(confirm.target);
            } else {
              void handleTransfer(confirm.target);
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}