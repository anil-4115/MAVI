import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { getErrorMessage } from "../../services/api";
import {
  listGroups,
  permanentlyDeleteGroup,
  restoreGroup,
  type PublicGroup,
} from "./api/groupsApi";
import { GroupCard } from "./components/GroupCard";
import "./groups.css";

type PendingAction =
  | { groupId: string; action: "restore" }
  | { groupId: string; action: "delete" }
  | null;

/**
 * Groups that were made read-only by their owner. Each card links to the
 * regular group detail page (read-only banner shown there); the owner can
 * restore the group back to Active Groups or permanently delete it from here.
 */
export function ArchivedGroupsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setGroups(null);
    try {
      setGroups(await listGroups("archived"));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Buttons inside the card Link must not also navigate to the detail page. */
  const stopNavigation = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRestore = async () => {
    if (!pending || pending.action !== "restore") {
      return;
    }
    setIsWorking(true);
    setActionError(null);
    try {
      await restoreGroup(pending.groupId);
      setPending(null);
      addToast("Group restored. It is back in Active Groups.", "success");
      navigate("/groups");
    } catch (restoreError) {
      setActionError(getErrorMessage(restoreError));
      setIsWorking(false);
      setPending(null);
    }
  };

  const handleDeleteForever = async () => {
    if (!pending || pending.action !== "delete") {
      return;
    }
    setIsWorking(true);
    setActionError(null);
    try {
      await permanentlyDeleteGroup(pending.groupId);
      setGroups((current) => current?.filter((group) => group.id !== pending.groupId) ?? null);
      setPending(null);
      setIsWorking(false);
      addToast("Group permanently deleted.", "success");
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError));
      setIsWorking(false);
      setPending(null);
    }
  };

  if (error) {
    return (
      <div className="app-page">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!groups) {
    return (
      <div className="app-page">
        <Spinner label="Loading archived groups" />
      </div>
    );
  }

  const pendingGroup = pending ? groups.find((group) => group.id === pending.groupId) : undefined;

  return (
    <div className="app-page">
      <Link className="group-detail__back" to="/groups">
        ← Back to groups
      </Link>

      <header className="page-header">
        <div>
          <h1 className="page-title">Archived groups</h1>
          <p className="page-subtitle">
            Archived groups are read-only. Their owner can restore them or permanently delete them
            here.
          </p>
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          title="No archived groups"
          description="Archived groups will appear here. Active groups can be archived from their group page."
          icon="groups"
        />
      ) : (
        <div className="card-grid">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              actions={
                group.myRole === "owner" ? (
                  <>
                    <button
                      className="btn btn--sm"
                      type="button"
                      onClick={(event) => {
                        stopNavigation(event);
                        setActionError(null);
                        setPending({ groupId: group.id, action: "restore" });
                      }}
                    >
                      Restore
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      type="button"
                      onClick={(event) => {
                        stopNavigation(event);
                        setActionError(null);
                        setPending({ groupId: group.id, action: "delete" });
                      }}
                    >
                      Delete forever
                    </button>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {actionError && (
        <div className="page-section">
          <Banner tone="error">{actionError}</Banner>
        </div>
      )}

      <ConfirmDialog
        open={pending?.action === "restore"}
        title={pendingGroup ? `Restore “${pendingGroup.name}”?` : "Restore group?"}
        message="The group will return to Active Groups. Its members, expenses, receipts, settlements and history will all remain exactly as they are."
        confirmLabel="Restore group"
        tone="accent"
        busy={isWorking}
        onConfirm={() => void handleRestore()}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.action === "delete"}
        title={pendingGroup ? `Permanently delete “${pendingGroup.name}”?` : "Permanently delete group?"}
        message="This permanently deletes the group along with all of its expenses, receipts, settlements and notifications. This cannot be undone from the app."
        confirmLabel="Delete forever"
        requireKeyword="PERMANENTLY"
        keywordLabel="Type PERMANENTLY to confirm"
        busy={isWorking}
        onConfirm={() => void handleDeleteForever()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}