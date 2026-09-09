import { useCallback, useEffect, useState } from "react";
import { Banner } from "../../components/ui/Banner";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { formatDate } from "../../lib/format";
import { formatMoney } from "../../lib/money";
import { getErrorMessage } from "../../services/api";
import { deletePersonalExpense, listPersonalExpenses, type PublicExpense } from "./api/expensesApi";
import { PersonalExpenseForm } from "./components/PersonalExpenseForm";
import "./expenses.css";
import "./personal-expenses.css";

const PAGE_SIZE = 20;

export function PersonalExpensesPage() {
  const [expenses, setExpenses] = useState<PublicExpense[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PublicExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  const openCreateForm = () => {
    setEditing(null);
    setShowForm(true);
    setActionError(null);
    setDone(null);
  };

  const openEditForm = (expense: PublicExpense) => {
    setEditing(expense);
    setShowForm(true);
    setActionError(null);
    setDone(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleFormCompleted = () => {
    const wasEditing = Boolean(editing);
    setDone(wasEditing ? "Expense updated." : "Expense added.");
    setActionError(null);
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
      setDone("Expense deleted.");
      void loadFirstPage();
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="app-page">
        <ErrorState message={error} onRetry={() => void loadFirstPage()} />
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Personal expenses</h1>
          <p className="page-subtitle">Track expenses that aren&apos;t shared with a group.</p>
        </div>
        {!showForm && (
          <div className="page-header__actions">
            <button className="btn" type="button" onClick={openCreateForm}>
              Add expense
            </button>
          </div>
        )}
      </header>

      {actionError && <Banner tone="error">{actionError}</Banner>}
      {done && <Banner tone="success">{done}</Banner>}

      {showForm && (
        <PersonalExpenseForm
          initial={editing}
          onCompleted={handleFormCompleted}
          onCancel={closeForm}
        />
      )}

      {expenses === null ? (
        <Spinner label="Loading personal expenses" />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No personal expenses yet"
          description="Expenses you record here stay private to you."
          action={
            !showForm ? (
              <button className="btn" type="button" onClick={openCreateForm}>
                Add your first expense
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="rows">
            {expenses.map((expense) => (
              <li key={expense.id} className="row">
                <div>
                  <p className="row__primary">{expense.title}</p>
                  <p className="row__secondary">{formatDate(expense.expenseDate)}</p>
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
                <button className="btn btn--secondary" type="button" onClick={() => void handleLoadMore()}>
                  Load more
                </button>
              )}
            </div>
          )}
        </>
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
    </div>
  );
}