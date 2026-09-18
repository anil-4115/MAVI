import { useState } from "react";
import { PersonalExpensesPanel } from "./components/PersonalExpensesPanel";
import "./expenses.css";
import "./personal-expenses.css";

export function PersonalExpensesPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Personal expenses</h1>
          <p className="page-subtitle">Track expenses that aren&apos;t shared with a group.</p>
        </div>
        {!showForm && (
          <div className="page-header__actions">
            <button className="btn" type="button" onClick={() => setShowForm(true)}>
              Add expense
            </button>
          </div>
        )}
      </header>

      <PersonalExpensesPanel autoAdd={showForm} onFormClosed={() => setShowForm(false)} />
    </div>
  );
}