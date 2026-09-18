import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { listGroupMembers, listGroups, type PublicGroup } from "../groups/api/groupsApi";
import type { PublicRecurringRule } from "./api/recurringApi";
import { RecurringForm } from "./components/RecurringForm";
import { RecurringRow } from "./components/RecurringRow";
import { useRecurringRules, type RecurringScope } from "./hooks/useRecurring";
import "./recurring.css";

export function RecurringPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("personal");
  const [members, setMembers] = useState<{ userId: string; name: string }[] | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicRecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicRecurringRule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const scope = useMemo<RecurringScope>(
    () => (selected === "personal" ? { type: "personal" } : { type: "group", groupId: selected }),
    [selected],
  );
  const { rules, error, reload, create, update, remove, setActive, generateNow } = useRecurringRules(scope);

  const selectedGroup = selected === "personal" ? null : groups?.find((group) => group.id === selected) ?? null;
  const currency = selectedGroup?.currency ?? "INR";
  const canWrite = selectedGroup?.archived !== true;
  const memberName = (userId: string): string =>
    members?.find((member) => member.userId === userId)?.name ?? "Member";

  useEffect(() => {
    let cancelled = false;
    listGroups()
      .then((result) => {
        if (!cancelled) {
          setGroups(result);
          setGroupsError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setGroupsError(getErrorMessage(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFormOpen(false);
    setEditing(null);
    setActionError(null);
    if (selected === "personal") {
      setMembers(null);
      return undefined;
    }
    let cancelled = false;
    setMembers(null);
    listGroupMembers(selected)
      .then((result) => {
        if (!cancelled) {
          setMembers(
            result
              .filter((member) => member.status === "active")
              .map((member) => ({ userId: member.userId, name: member.name })),
          );
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(getErrorMessage(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleGenerate = useCallback(
    async (rule: PublicRecurringRule) => {
      setBusyId(rule.id);
      setActionError(null);
      try {
        const result = await generateNow(rule.id);
        if (result.generated) {
          addToast("Recurring expense generated.", "success");
        } else if (result.deactivated) {
          addToast("Rule finished; no expense generated.", "info");
        } else {
          addToast("No occurrence is due today.", "info");
        }
      } catch (runError) {
        setActionError(getErrorMessage(runError));
      } finally {
        setBusyId(null);
      }
    },
    [generateNow, addToast],
  );

  const handleToggle = useCallback(
    async (rule: PublicRecurringRule) => {
      setBusyId(rule.id);
      setActionError(null);
      try {
        await setActive(rule.id, !rule.active);
        addToast(rule.active ? "Rule paused." : "Rule resumed.", "success");
      } catch (toggleError) {
        setActionError(getErrorMessage(toggleError));
      } finally {
        setBusyId(null);
      }
    },
    [setActive, addToast],
  );

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    setActionError(null);
    try {
      await remove(deleteTarget.id);
      addToast("Recurring rule deleted. Past generated expenses were kept.", "success");
      setDeleteTarget(null);
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (rule: PublicRecurringRule) => {
    setEditing(rule);
    setFormOpen(true);
  };

  const handleCompleted = (wasEditing: boolean) => {
    setFormOpen(false);
    setEditing(null);
    addToast(wasEditing ? "Recurring rule updated." : "Recurring rule created.", "success");
  };

  const renderRules = () => {
    if (error) {
      return <ErrorState message={error} onRetry={() => void reload()} />;
    }
    if (rules === null || (selected !== "personal" && members === null)) {
      return <Spinner label="Loading recurring rules" />;
    }
    if (rules.length === 0) {
      return (
        <EmptyState
          title="No recurring rules yet"
          description={
            selected === "personal"
              ? "Set up rent, subscriptions or any bill to record it automatically."
              : "Create a rule to automatically record this group's shared bills."
          }
          icon="clock"
        />
      );
    }
    return (
      <ul className="rows recurring-list">
        {rules.map((rule) => (
          <RecurringRow
            key={rule.id}
            rule={rule}
            currency={currency}
            memberName={memberName}
            archived={!canWrite}
            busy={busyId === rule.id}
            onEdit={() => openEdit(rule)}
            onToggleActive={() => void handleToggle(rule)}
            onGenerateNow={() => void handleGenerate(rule)}
            onDelete={() => setDeleteTarget(rule)}
          />
        ))}
      </ul>
    );
  };

  const showForm = formOpen && (selected === "personal" || members !== null);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Recurring Expenses</h1>
          <p className="page-subtitle">Automate recurring bills for yourself or a group.</p>
        </div>
      </header>

      {groupsError && <Banner tone="error">{groupsError}</Banner>}
      {actionError && <Banner tone="error">{actionError}</Banner>}

      {groups === null && !groupsError ? (
        <Skeleton variant="card" />
      ) : (
        <>
          <div className="recurring-toolbar">
            <div className="field recurring-toolbar__scope">
              <label htmlFor="recurring-scope">Showing</label>
              <select
                id="recurring-scope"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="personal">Personal</option>
                {groups?.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                    {group.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {!showForm && (
              <button
                className="btn btn--sm"
                type="button"
                disabled={!canWrite || (selected !== "personal" && members === null)}
                onClick={openCreate}
              >
                New rule
              </button>
            )}
          </div>

          {!canWrite && (
            <p className="form-hint">This group is archived, so recurring rules are read-only.</p>
          )}

          {showForm ? (
            <RecurringForm
              key={editing?.id ?? "new"}
              scope={scope}
              members={members ?? []}
              currency={currency}
              currentUserId={user?.id ?? ""}
              archived={!canWrite}
              initial={editing}
              onCreate={create}
              onUpdate={update}
              onCompleted={() => handleCompleted(Boolean(editing))}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          ) : (
            <section className="card">{renderRules()}</section>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete “${deleteTarget.title}”?`}
          message="The rule and its schedule are removed. Expenses already generated are kept. This cannot be undone."
          confirmLabel="Delete rule"
          busy={isDeleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
