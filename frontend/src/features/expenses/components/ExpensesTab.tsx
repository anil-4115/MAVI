import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Spinner } from "../../../components/ui/Spinner";
import { formatDate, formatDateTime } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import { listGroupMembers, type GroupRole } from "../../groups/api/groupsApi";
import {
  deleteGroupExpense,
  getGroupExpense,
  listGroupExpenses,
  type PublicExpense,
  type SplitMethod,
} from "../api/expensesApi";
import { ExpenseForm } from "./ExpenseForm";

const PAGE_SIZE = 20;

const SPLIT_LABELS: Record<SplitMethod, string> = {
  equal: "Equally",
  quantity: "By quantity",
  exact: "Exact amounts",
  percentage: "By percentage",
  shares: "By shares",
  itemwise: "By items",
};

interface ActiveMember {
  userId: string;
  name: string;
}

interface ExpensesTabProps {
  groupId: string;
  currency: string;
  archived: boolean;
  myRole: GroupRole | null;
  currentUserId: string | null;
  onGroupChanged: () => void;
}

export function ExpensesTab({
  groupId,
  currency,
  archived,
  myRole,
  currentUserId,
  onGroupChanged,
}: ExpensesTabProps) {
  const [members, setMembers] = useState<ActiveMember[] | null>(null);
  const [expenses, setExpenses] = useState<PublicExpense[]>([]);
  const [total, setTotal] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PublicExpense | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, PublicExpense>>({});
  const [voidTarget, setVoidTarget] = useState<PublicExpense | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const membersResult = await listGroupMembers(groupId);
      setMembers(membersResult.filter((member) => member.status === "active").map((member) => ({ userId: member.userId, name: member.name })));
    } catch (loadError) {
      setActionError(getErrorMessage(loadError));
    }
  }, [groupId]);

  const loadFirstPage = useCallback(async () => {
    setIsInitialLoading(true);
    setError(null);
    try {
      const result = await listGroupExpenses(groupId, { page: 1, limit: PAGE_SIZE });
      setExpenses(result.items);
      setTotal(result.total);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsInitialLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadMembers();
    void loadFirstPage();
  }, [loadMembers, loadFirstPage]);

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setActionError(null);
    try {
      const nextPage = Math.floor(expenses.length / PAGE_SIZE) + 1;
      const result = await listGroupExpenses(groupId, { page: nextPage, limit: PAGE_SIZE });
      setExpenses((current) => [...current, ...result.items]);
      setTotal(result.total);
    } catch (loadError) {
      setActionError(getErrorMessage(loadError));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const refresh = useCallback(async () => {
    setCreating(false);
    setEditing(null);
    setDone(null);
    setActionError(null);
    setVoidTarget(null);
    setIsVoiding(false);
    await Promise.all([loadFirstPage(), loadMembers()]);
    onGroupChanged();
  }, [loadFirstPage, loadMembers, onGroupChanged]);

  const handleDetailToggle = async (expenseId: string) => {
    if (detailId === expenseId) {
      setDetailId(null);
      return;
    }
    setDetailId(expenseId);
    if (detailCache[expenseId]) {
      return;
    }
    try {
      const detail = await getGroupExpense(groupId, expenseId);
      setDetailCache((current) => ({ ...current, [expenseId]: detail }));
    } catch (loadError) {
      setActionError(getErrorMessage(loadError));
    }
  };

  const handleVoid = async () => {
    if (!voidTarget) {
      return;
    }
    setIsVoiding(true);
    setActionError(null);
    try {
      await deleteGroupExpense(groupId, voidTarget.id);
      await loadFirstPage();
      setDetailId(null);
      setDone("Expense voided. It no longer counts toward balances.");
      setVoidTarget(null);
      onGroupChanged();
    } catch (voidError) {
      setActionError(getErrorMessage(voidError));
      setVoidTarget(null);
    } finally {
      setIsVoiding(false);
    }
  };

  const memberName = (userId: string): string =>
    members?.find((member) => member.userId === userId)?.name ?? "Member";

  const canModify = (expense: PublicExpense): boolean =>
    !archived && (myRole === "owner" || expense.createdBy === currentUserId);

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadFirstPage()} />;
  }

  if (isInitialLoading) {
    return <Spinner label="Loading expenses" />;
  }

  if ((creating || editing) && members) {
    return (
      <ExpenseForm
        groupId={groupId}
        members={members}
        currency={currency}
        currentUserId={currentUserId ?? ""}
        archived={archived}
        initial={editing}
        onCompleted={() => void refresh()}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div>
      {actionError && <Banner tone="error">{actionError}</Banner>}
      {done && <Banner tone="success">{done}</Banner>}

      {!archived && (
        <div className="members-toolbar">
          <button className="btn btn--sm" type="button" onClick={() => setCreating(true)}>
            Add expense
          </button>
        </div>
      )}
      {archived && (
        <p className="form-hint">
          This group is archived, so expenses are read-only. Add an expense before archiving to include it.
        </p>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description={archived ? "This group has no recorded expenses." : "Add the first shared expense to start splitting."}
        />
      ) : (
        <>
          <ul className="rows">
            {expenses.map((expense) => {
              const expanded = detailId === expense.id;
              const detail = detailCache[expense.id];
              const shares = detail ? detail.participantShares : expense.participantShares;
              return (
                <li key={expense.id} className="expense-row">
                  <button className="row row--link expense-row__toggle" type="button" onClick={() => void handleDetailToggle(expense.id)} aria-expanded={expanded}>
                    <div>
                      <p className="row__primary">{expense.title}</p>
                      <p className="row__secondary">
                        {memberName(expense.payerId)} paid · {formatDate(expense.expenseDate)}
                      </p>
                    </div>
                    <p className="row__meta expense-row__amount">
                      {formatMoney(expense.amountMinor, expense.currency)}
                      <span className="badge badge--muted">{SPLIT_LABELS[expense.splitMethod] ?? expense.splitMethod}</span>
                    </p>
                  </button>

                  {expanded && (
                    <div className="expense-row__detail">
                      {detail ? (
                        <>
                          <div className="expense-row__meta-grid">
                            <div>
                              <p className="form-hint">Split</p>
                              <p className="expense-row__meta-value">
                                {SPLIT_LABELS[detail.splitMethod] ?? detail.splitMethod}
                              </p>
                            </div>
                            <div>
                              <p className="form-hint">Created</p>
                              <p className="expense-row__meta-value">{formatDateTime(detail.createdAt)}</p>
                            </div>
                            <div>
                              <p className="form-hint">Updated</p>
                              <p className="expense-row__meta-value">{formatDateTime(detail.updatedAt)}</p>
                            </div>
                          </div>

                          <div className="expense-shares">
                            <p className="form-hint">Who owes what</p>
                            <ul className="rows expense-shares__list">
                              {shares.map((share) => (
                                <li key={share.userId} className="row">
                                  <p className="row__primary">{memberName(share.userId)}</p>
                                  <p className={`row__meta ${share.amountMinor < 0 ? "money--negative" : ""}`}>
                                    {formatMoney(share.amountMinor, detail.currency)}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {canModify(detail) && (
                            <div className="expense-row__actions">
                              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(detail)}>
                                Edit
                              </button>
                              <button className="btn btn--danger btn--sm" type="button" onClick={() => setVoidTarget(detail)}>
                                Void expense
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <Spinner label="Loading expense details" />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {expenses.length < total && (
            <div className="expenses-more">
              {isLoadingMore ? (
                <Spinner label="Loading more" />
              ) : (
                <button className="btn btn--secondary" type="button" onClick={() => void handleLoadMore()}>
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      )}

      {voidTarget && (
        <ConfirmDialog
          open
          title={`Void “${voidTarget.title}”?`}
          message="Voiding removes this expense from balances and history immediately. This cannot be undone from the app."
          confirmLabel="Void expense"
          busy={isVoiding}
          onConfirm={() => void handleVoid()}
          onCancel={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}