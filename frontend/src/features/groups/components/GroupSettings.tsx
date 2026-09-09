import { useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { getErrorMessage } from "../../../services/api";
import { archiveGroup, updateGroup, type PublicGroup } from "../api/groupsApi";
import { validateGroupDescription, validateGroupName } from "../lib/validators";

interface GroupSettingsProps {
  group: PublicGroup;
  onSaved: (group: PublicGroup) => void;
  onArchived: (group: PublicGroup) => void;
}

/**
 * Group management panel for owner/admin members (rendered by the detail
 * page). Covers editing the group name/description and (owner only) archiving
 * the group. Archived groups are read-only everywhere.
 */
export function GroupSettings({ group, onSaved, onArchived }: GroupSettingsProps) {
  const isOwner = group.myRole === "owner";
  const canEdit = group.myRole === "owner" || group.myRole === "admin";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string | null; description?: string | null }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  if (!canEdit || group.archived) {
    return null;
  }

  const startEditing = () => {
    setName(group.name);
    setDescription(group.description ?? "");
    setFieldErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const errors = {
      name: validateGroupName(name),
      description: validateGroupDescription(description),
    };
    setFieldErrors(errors);
    setSaveError(null);
    if (errors.name || errors.description) {
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateGroup(group.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setEditing(false);
      onSaved(updated);
    } catch (saveError2) {
      setSaveError(getErrorMessage(saveError2));
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    setArchiveError(null);
    try {
      const archived = await archiveGroup(group.id);
      setConfirmArchive(false);
      onArchived(archived);
    } catch (archiveFailure) {
      setArchiveError(getErrorMessage(archiveFailure));
      setIsArchiving(false);
      setConfirmArchive(false);
    }
  };

  return (
    <section className="mgmt-card card" aria-label="Group management">
      <div className="mgmt-card__head">
        <h2 className="card__title">Group management</h2>
        {!editing && (
          <button className="btn btn--ghost btn--sm" type="button" onClick={startEditing}>
            Edit details
          </button>
        )}
      </div>

      {editing ? (
        <form className="form" onSubmit={handleSave} noValidate>
          {saveError && <Banner tone="error">{saveError}</Banner>}
          <div className={`field${fieldErrors.name ? " field--invalid" : ""}`}>
            <label htmlFor="edit-group-name">Group name</label>
            <input
              id="edit-group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "edit-group-name-error" : undefined}
            />
            {fieldErrors.name && (
              <span id="edit-group-name-error" className="field__error">
                {fieldErrors.name}
              </span>
            )}
          </div>
          <div className={`field${fieldErrors.description ? " field--invalid" : ""}`}>
            <label htmlFor="edit-group-description">Description</label>
            <textarea
              id="edit-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? "edit-group-description-error" : undefined}
            />
            {fieldErrors.description && (
              <span id="edit-group-description-error" className="field__error">
                {fieldErrors.description}
              </span>
            )}
          </div>
          <div className="form__actions">
            <button className="btn" type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => setEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="mgmt-card__hint">
          Manage the group&apos;s name, description and lifecycle. Expenses and settlements are
          added from their own tabs.
        </p>
      )}

      {isOwner && (
        <div className="mgmt-card__danger">
          {archiveError && <Banner tone="error">{archiveError}</Banner>}
          <button
            className="btn btn--danger btn--sm"
            type="button"
            onClick={() => setConfirmArchive(true)}
          >
            Archive group
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive “${group.name}”?`}
        message="Archiving makes the group read-only for everyone. Balances and history stay visible, but no new expenses or settlements can be added. This cannot be undone from the app."
        confirmLabel="Archive group"
        busy={isArchiving}
        onConfirm={() => void handleArchive()}
        onCancel={() => setConfirmArchive(false)}
      />
    </section>
  );
}