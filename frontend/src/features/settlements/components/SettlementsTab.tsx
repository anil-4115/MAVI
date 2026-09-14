import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../components/ui/Toast";
import { formatDate } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import { getGroupBalances, type GroupBalances, type SuggestedSettlement } from "../../balances/api/balancesApi";
import { listGroupMembers, type GroupRole } from "../../groups/api/groupsApi";
import { cancelSettlement, listSettlements, type PublicSettlement, type SettlementStatus } from "../api/settlementsApi";
import { SettlementForm } from "./SettlementForm";

interface SettlementsTabProps {
  groupId: string;
  currency: string;
  archived: boolean;
  myRole: GroupRole | null;
  currentUserId: string | null;
  onGroupChanged: () => void;
}

type Filter = "all" | SettlementStatus;

const PAGE_SIZE = 20;

export function SettlementsTab({
  groupId,
  currency,
  archived,
  myRole,
  currentUserId,
  onGroupChanged,
}: SettlementsTabProps) {
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  const [balances, setBalances] = useState<GroupBalances | null>(null);

  const [settlements, setSettlements] = useState<PublicSettlement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<SuggestedSettlement | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PublicSettlement | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { addToast } = useToast();

  const statusFilter = filter === "all" ? undefined : filter;

  const loadFirst = useCallback(() => {
    setInitialLoading(true);
    setError(null);
    listSettlements(groupId, { page: 1, limit: PAGE_SIZE, status: statusFilter })
      .then((result) => {
        setSettlements(result.items);
        setTotal(result.total);
        setPage(1);
      })
      .catch((loadError: unknown) => {
        setError(getErrorMessage(loadError));
      })
      .finally(() => setInitialLoading(false));
  }, [groupId, statusFilter]);

  const loadBalances = useCallback(() => {
    getGroupBalances(groupId)
      .then(setBalances)
      .catch(() => {
        setBalances(null);
      });
  }, [groupId]);

  useEffect(() => {
    listGroupMembers(groupId)
      .then((result) => setMembers(result.filter((member) => member.status === "active").map(({ userId, name }) => ({ userId, name }))))
      .catch(() => setMembers([]));
  }, [groupId]);

  useEffect(() => {
    loadFirst();
    loadBalances();
  }, [loadFirst, loadBalances]);

  const refreshAfterMutation = () => {
    loadFirst();
    loadBalances();
    onGroupChanged();
  };

  const loadMore = () => {
    if (loadingMore) {
      return;
    }
    setLoadingMore(true);
    listSettlements(groupId, { page: page + 1, limit: PAGE_SIZE, status: statusFilter })
      .then((result) => {
        setSettlements((current) => [...current, ...result.items]);
        setTotal(result.total);
        setPage((current) => current + 1);
      })
      .finally(() => setLoadingMore(false));
  };

  const nameOf = (userId: string): string => {
    const fromBalances = balances?.members.find((member) => member.userId === userId);
    if (fromBalances) {
      return fromBalances.name;
    }
    return members.find((member) => member.userId === userId)?.name ?? "Member";
  };

  const directionLabel = (settlement: PublicSettlement): string => {
    if (settlement.payerId === currentUserId) {
      return `You paid ${nameOf(settlement.receiverId)}`;
    }
    if (settlement.receiverId === currentUserId) {
      return `${nameOf(settlement.payerId)} paid you`;
    }
    return `${nameOf(settlement.payerId)} paid ${nameOf(settlement.receiverId)}`;
  };

  const canCancel = (settlement: PublicSettlement): boolean =>
    settlement.status === "completed" &&
    (settlement.createdBy === currentUserId || myRole === "owner");

  const hasMore = settlements.length < total;

  const emptyMessage: { title: string; description: string } =
    filter === "completed"
      ? { title: "No completed settlements", description: "Cancelled records are hidden by the current filter." }
      : filter === "cancelled"
        ? { title: "No cancelled settlements", description: "Completed records are hidden by the current filter." }
        : {
            title: "No settlements yet",
            description: "Record the first settlement, or use a suggested transfer from the balances view.",
          };

  const openSuggestion = (suggestion: SuggestedSettlement) => {
    setPrefill(suggestion);
    setFormOpen(true);
  };

  const openBlank = () => {
    setPrefill(null);
    setFormOpen(true);
  };

  const handleRecorded = () => {
    setFormOpen(false);
    setPrefill(null);
    setActionError(null);
    addToast("Settlement recorded.", "success");
    refreshAfterMutation();
  };

  const handleCancelSettlement = async () => {
    if (!cancelTarget) {
      return;
    }
    setActionError(null);
    setIsCancelling(true);
    try {
      await cancelSettlement(groupId, cancelTarget.id);
      setCancelTarget(null);
      addToast("Settlement cancelled.", "success");
      refreshAfterMutation();
    } catch (cancelFailure) {
      setActionError(getErrorMessage(cancelFailure));
      setCancelTarget(null);
    } finally {
      setIsCancelling(false);
    }
  };

  const suggestions =
    balances && balances.totalOutstandingMinor > 0 ? balances.suggestedSettlements : [];

  return (
    <div>
      {archived && (
        <p className="form-hint">
          This group is archived. The historical records below stay visible; new settlements can&apos;t be
          added (cancelling an existing record is still allowed and keeps history).
        </p>
      )}

      {actionError && <Banner tone="error">{actionError}</Banner>}

      {!archived && (
        <div className="settlements-toolbar">
          <button className="btn" type="button" onClick={openBlank} disabled={members.length < 2}>
            Record settlement
          </button>
          {members.length < 2 && (
            <p className="form-hint">A settlement needs at least two active members in the group.</p>
          )}
        </div>
      )}

      <div className="settlements-filters" role="group" aria-label="Filter settlements by status">
        {(["all", "completed", "cancelled"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`btn btn--sm ${filter === option ? "settlements-filters__item--active" : "btn--secondary"}`}
            onClick={() => setFilter(option)}
          >
            {option === "all" ? "All" : option === "completed" ? "Completed" : "Cancelled"}
          </button>
        ))}
      </div>

      {initialLoading ? (
        <Spinner label="Loading settlements" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadFirst} />
      ) : settlements.length === 0 ? (
        <EmptyState title={emptyMessage.title} description={emptyMessage.description} />
      ) : (
        <ul className="rows">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="row settlement-row">
              <div className="settlement-row__info">
                <p className="row__primary">
                  {directionLabel(settlement)}{" "}
                  <span
                    className={`badge ${settlement.status === "completed" ? "badge--success" : "badge--muted"}`}
                  >
                    {settlement.status}
                  </span>
                </p>
                <p className="row__secondary">
                  {formatDate(settlement.date)}
                  {settlement.note ? ` · ${settlement.note}` : ""}
                </p>
              </div>
              <div className="settlement-row__aside">
                <p className="row__meta">{formatMoney(settlement.amountMinor, currency)}</p>
                {canCancel(settlement) && (
                  <button
                    className="btn btn--danger btn--sm"
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setCancelTarget(settlement);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!initialLoading && hasMore && (
        <div className="settlements-more">
          <button className="btn btn--secondary" type="button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <section className="section">
          <h2 className="section__title">Suggested settlements</h2>
          <p className="settlements-note">
            Backend suggestions from the balances engine — record one and the balances update automatically.
          </p>
          <ul className="rows">
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.fromUserId}-${suggestion.toUserId}-${index}`}
                className="row settlement-row"
              >
                <div className="settlement-row__info">
                  <p className="row__primary">
                    {suggestion.fromUserId === currentUserId
                      ? `You should pay ${nameOf(suggestion.toUserId)}`
                      : suggestion.toUserId === currentUserId
                        ? `${nameOf(suggestion.fromUserId)} should pay you`
                        : `${nameOf(suggestion.fromUserId)} should pay ${nameOf(suggestion.toUserId)}`}
                  </p>
                </div>
                <div className="settlement-row__aside">
                  <p className="row__meta">{formatMoney(suggestion.amountMinor, currency)}</p>
                  {!archived && (
                    <button className="btn btn--sm" type="button" onClick={() => openSuggestion(suggestion)}>
                      Record
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {formOpen && (
        <SettlementForm
          groupId={groupId}
          currency={currency}
          members={members}
          currentUserId={currentUserId}
          archived={archived}
          prefill={prefill}
          onCompleted={handleRecorded}
          onCancel={() => {
            setFormOpen(false);
            setPrefill(null);
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel settlement?"
        message={
          cancelTarget
            ? `${directionLabel(cancelTarget)} ${formatMoney(cancelTarget.amountMinor, currency)}. The record stays in history, and the balances automatically exclude it.`
            : undefined
        }
        confirmLabel="Cancel settlement"
        tone="danger"
        busy={isCancelling}
        onConfirm={() => void handleCancelSettlement()}
        onCancel={() => {
          if (!isCancelling) {
            setCancelTarget(null);
          }
        }}
      />
    </div>
  );
}