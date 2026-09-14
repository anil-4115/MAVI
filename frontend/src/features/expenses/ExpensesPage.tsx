import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatDate } from "../../lib/format";
import { formatMoney } from "../../lib/money";
import { getErrorMessage } from "../../services/api";
import { listGroups, type PublicGroup } from "../groups/api/groupsApi";
import { listGroupExpenses, type PublicExpense } from "./api/expensesApi";
import { PersonalExpensesPanel } from "./components/PersonalExpensesPanel";

type ExpensesSection = "personal" | "group";

const SECTIONS: { id: ExpensesSection; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "group", label: "Group" },
];

const GROUP_LIMIT = 5;

function GroupExpensesOverview() {
  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [expensesByGroup, setExpensesByGroup] = useState<Record<string, PublicExpense[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setGroups(null);
    try {
      const result = await listGroups();
      setGroups(result);
      const recent = await Promise.all(
        result.map(async (group) => {
          const page = await listGroupExpenses(group.id, { page: 1, limit: GROUP_LIMIT });
          return [group.id, page.items] as const;
        }),
      );
      setExpensesByGroup(Object.fromEntries(recent));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  if (!groups) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Loading group expenses">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No groups yet"
        description="Create a group to split shared expenses."
        icon="groups"
        action={
          <Link className="btn" to="/groups">
            Go to Groups
          </Link>
        }
      />
    );
  }

  return (
    <div className="expenses-overview">
      {groups.map((group) => {
        const rows = expensesByGroup[group.id] ?? [];
        return (
          <section className="card" key={group.id}>
            <div className="card__header">
              <Link className="card__title" to={`/groups/${group.id}?tab=expenses`}>
                <span className="card__title-icon">
                  <Avatar name={group.name} size="sm" />
                </span>
                {group.name}
              </Link>
              <Link className="btn btn--sm btn--ghost" to={`/groups/${group.id}?tab=expenses`}>
                View all
              </Link>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                title="No expenses yet"
                description="Add the first shared expense in this group."
                icon="expenses"
                action={
                  !group.archived ? (
                    <Link className="btn btn--sm" to={`/groups/${group.id}?tab=expenses&add=1`}>
                      Add expense
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="rows">
                {rows.map((expense) => (
                  <li key={expense.id} className="row">
                    <div>
                      <p className="row__primary">{expense.title}</p>
                      <p className="row__secondary">{formatDate(expense.expenseDate)}</p>
                    </div>
                    <p className="row__meta">{formatMoney(expense.amountMinor, expense.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const addFlag = searchParams.get("add") === "1";
  const [section, setSection] = useState<ExpensesSection>("personal");

  useEffect(() => {
    if (addFlag) {
      setSearchParams({}, { replace: true });
    }
  }, [addFlag, setSearchParams]);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Personal and shared spending in one place.</p>
        </div>
      </header>
      <div className="expenses-page-toolbar">
        <div className="segmented" role="tablist" aria-label="Expense types">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={section === entry.id}
              className={`segmented__option${section === entry.id ? " segmented__option--active" : ""}`}
              onClick={() => setSection(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {section === "personal" ? (
          !addFlag && (
            <Link className="btn btn--sm" to="/expenses/personal">
              Manage personal expenses
            </Link>
          )
        ) : (
          <Link className="btn btn--sm" to="/groups">
            New group
          </Link>
        )}
      </div>

      {section === "personal" && <PersonalExpensesPanel autoAdd={addFlag} />}

      {section === "group" && <GroupExpensesOverview />}
    </div>
  );
}