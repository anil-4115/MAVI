import { useState } from "react";
import { Banner } from "../../../components/ui/Banner";
import { getErrorMessage } from "../../../services/api";
import { acceptInvitation, declineInvitation, type GroupInvitePreview } from "../api/groupsApi";

interface GroupInvitationProps {
  preview: GroupInvitePreview;
  currentUserId: string;
  onAccepted: () => void;
  onDeclined: () => void;
}

/**
 * Rendered by the detail page when the viewer is not an active member of the
 * group but holds an invitation (backend GET /groups/:id/preview). Lets the
 * invitee accept or decline directly from the shared URL.
 */
export function GroupInvitation({ preview, currentUserId, onAccepted, onDeclined }: GroupInvitationProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: "accept" | "decline") => {
    setBusy(true);
    setError(null);
    try {
      if (action === "accept") {
        await acceptInvitation(preview.id, currentUserId);
        onAccepted();
      } else {
        await declineInvitation(preview.id, currentUserId);
        onDeclined();
      }
    } catch (respondError) {
      setError(getErrorMessage(respondError));
      setBusy(false);
    }
  };

  return (
    <div className="app-page">
      <section className="card invitation-card" aria-label={`Invitation to ${preview.name}`}>
        <h1 className="page-title">{preview.name}</h1>
        {preview.description && <p className="page-subtitle">{preview.description}</p>}
        <p className="group-detail__meta">
          {preview.currency} · created by another member · open invitation
        </p>

        <div className="invitation-card__body">
          <p className="invitation-card__copy">
            You&apos;ve been invited to join this group. Accept to start sharing expenses with
            its members.
          </p>
        </div>

        {error && <Banner tone="error">{error}</Banner>}

        <div className="invitation-card__actions">
          <button className="btn" type="button" onClick={() => void respond("accept")} disabled={busy}>
            {busy ? "Working…" : "Accept invitation"}
          </button>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => void respond("decline")}
            disabled={busy}
          >
            Decline
          </button>
        </div>
      </section>
    </div>
  );
}