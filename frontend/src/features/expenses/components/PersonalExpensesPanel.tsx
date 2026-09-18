import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Icon } from "../../../components/ui/Icon";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../components/ui/Toast";
import { formatDate } from "../../../lib/format";
import { formatMoney } from "../../../lib/money";
import { getErrorMessage } from "../../../services/api";
import {
  deletePersonalExpense,
  listPersonalExpenses,
  type PublicExpense,
} from "../api/expensesApi";
import { PersonalExpenseForm } from "./PersonalExpenseForm";

const PAGE_SIZE = 20;

interface PersonalExpensesPanelProps {
  autoAdd?: boolean;
  onFormClosed?: () => void;
}

/** Personal expenses list + add/edit form, without the page chrome. */
export function PersonalExpensesPanel({ autoAdd = false, onFormClosed }: PersonalExpensesPanelProps) {
  const [expenses, setExpenses] = useState<PublicExpense[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [showForm, setShowForm] = useState(autoAdd);
  const [editing, setEditing] = useState<PublicExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const { addToast } = useToast();

  const loadFirstPage = useCallback(async () => {
    try {
      const result = await listPersonalExpenses({ page: 1, limit: PAGE_SIZE });
      setExpenses(result.items);
      setTotal(result.total);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  /* Open the create form whenever the parent raises `autoAdd` (quick-add).
     State alone used the mount-time value, so a parent could hide its trigger
     while the form never appeared. */
  useEffect(() => {
    if (autoAdd) {
      setEditing(null);
      setShowForm(true);
      setActionError(null);
    }
  }, [autoAdd]);

  const openCreateForm = () => {
    setEditing(null);
    setShowForm(true);
    setActionError(null);
  };

  const openEditForm = (expense: PublicExpense) => {
    setEditing(expense);
    setShowForm(true);
    setActionError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    onFormClosed?.();
  };

  const handleFormCompleted = () => {
    const wasEditing = Boolean(editing);
    addToast(wasEditing ? "Expense updated." : "Expense added.", "success");
    closeForm();
    void loadFirstPage();
  };

  const handleLoadMore = async () => {
    if (!expenses) {
      return;
    }
    setIsLoadingMore(true);
    setActionError(null);
    try {
      const nextPage = Math.floor(expenses.length / PAGE_SIZE) + 1;
      const result = await listPersonalExpenses({ page: nextPage, limit: PAGE_SIZE });
      setExpenses((current) => [...(current ?? []), ...result.items]);
      setTotal(result.total);
    } catch (loadError) {
      setActionError(getErrorMessage(loadError));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    setActionError(null);
    try {
      await deletePersonalExpense(deleteTarget.id);
      setDeleteTarget(null);
      addToast("Expense deleted.", "success");
      void loadFirstPage();
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadFirstPage()} />;
  }

  return (
    <>
      {actionError && <Banner tone="error">{actionError}</Banner>}

      {showForm ? (
        <PersonalExpenseForm
          initial={editing}
          onCompleted={handleFormCompleted}
          onCancel={closeForm}
        />
      ) : (
        expenses === null ? (
          <Spinner label="Loading personal expenses" />
        ) : expenses.length === 0 ? (
          <EmptyState
            title="No personal expenses yet"
            description="Expenses you record here stay private to you."
            icon="expenses"
            action={
              <button className="btn" type="button" onClick={openCreateForm}>
                Add your first expense
              </button>
            }
          />
        ) : (
          <>
            <ul className="rows">
              {expenses.map((expense) => (
                <li key={expense.id} className="row personal-expense">
                  <span className="personal-expense__icon" aria-hidden="true">
                    <Icon name="expenses" size={16} />
                  </span>
                  <div className="personal-expense__body">
                    <p className="row__primary">{expense.title}</p>
                    <p className="row__secondary expense-row__indicator">
                      {formatDate(expense.expenseDate)}
                      {expense.attachment && <span className="badge badge--accent">Receipt</span>}
                    </p>
                  </div>
                  <p className="row__meta personal-row__meta">
                    <span className="personal-row__amount">
                      {formatMoney(expense.amountMinor, expense.currency)}
                    </span>
                    <span className="personal-row__actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => openEditForm(expense)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn--danger btn--sm"
                        type="button"
                        onClick={() => setDeleteTarget(expense)}
                      >
                        Delete
                      </button>
                    </span>
                  </p>
                </li>
              ))}
            </ul>

            {expenses.length < total && (
              <div className="expenses-more">
                {isLoadingMore ? (
                  <Spinner label="Loading more" />
                ) : (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => void handleLoadMore()}
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </>
        )
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Delete “${deleteTarget.title}”?`}
          message="Deleting removes this expense from your personal record and cannot be undone from the app."
          confirmLabel="Delete expense"
          busy={isDeleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}