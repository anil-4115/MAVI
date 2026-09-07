import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";
import { getErrorMessage } from "../../services/api";
import { createGroup, listGroups, type PublicGroup } from "./api/groupsApi";

/** Mirror of backend name/description rules (group.validation.ts). */
const validateName = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Group name is required.";
  }
  if (trimmed.length > 80) {
    return "Group name must be 80 characters or fewer.";
  }
  return null;
};

const validateDescription = (value: string): string | null => {
  if (value.trim().length > 300) {
    return "Description must be 300 characters or fewer.";
  }
  return null;
};

function GroupCard({ group }: { group: PublicGroup }) {
  return (
    <Link to={`/groups/${group.id}`} className="link-card">
      <div className="card">
        <div className="group-card__top">
          <h3 className="group-card__name">{group.name}</h3>
          <span className="badge badge--accent">{group.myRole ?? "member"}</span>
        </div>
        {group.description && <p className="group-card__description">{group.description}</p>}
        <p className="group-card__meta">
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"} ·{" "}
          {formatDateTime(group.createdAt)}
        </p>
      </div>
    </Link>
  );
}

export function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<PublicGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | null;
    description?: string | null;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setError(null);
    setGroups(null);
    try {
      setGroups(await listGroups());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = {
      name: validateName(name),
      description: validateDescription(description),
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.name || errors.description) {
      return;
    }

    setIsSubmitting(true);
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      navigate(`/groups/${group.id}`);
    } catch (createError) {
      setFormError(getErrorMessage(createError));
      setIsSubmitting(false);
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
        <Spinner label="Loading groups" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Groups</h1>
          <p className="page-subtitle">Split shared expenses with friends and family.</p>
        </div>
        {!showForm && (
          <div className="page-header__actions">
            <button className="btn" type="button" onClick={() => setShowForm(true)}>
              New group
            </button>
          </div>
        )}
      </header>

      {showForm && (
        <section className="card" aria-label="Create a group">
          <h2 className="card__title">Create a group</h2>
          {formError && <Banner tone="error">{formError}</Banner>}
          <form className="form" onSubmit={handleSubmit} noValidate>
            <div className={`field${fieldErrors.name ? " field--invalid" : ""}`}>
              <label htmlFor="group-name">Group name</label>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekend trip"
                autoFocus
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "group-name-error" : undefined}
              />
              {fieldErrors.name && (
                <span id="group-name-error" className="field__error">
                  {fieldErrors.name}
                </span>
              )}
            </div>
            <div className={`field${fieldErrors.description ? " field--invalid" : ""}`}>
              <label htmlFor="group-description">Description (optional)</label>
              <textarea
                id="group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group for?"
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? "group-description-error" : undefined}
              />
              {fieldErrors.description && (
                <span id="group-description-error" className="field__error">
                  {fieldErrors.description}
                </span>
              )}
            </div>
            <div className="form__actions">
              <button className="btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create group"}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => setShowForm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create a group to start tracking shared expenses."
          action={
            <button className="btn" type="button" onClick={() => setShowForm(true)}>
              Create your first group
            </button>
          }
        />
      ) : (
        <div className="card-grid">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}