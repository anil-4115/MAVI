import { useState, type FormEvent } from "react";
import { Banner } from "../../../components/ui/Banner";
import { useToast } from "../../../components/ui/Toast";
import { getErrorMessage } from "../../../services/api";
import { searchUsers, type UserSearchResult } from "../../users/api/usersApi";
import { inviteMember } from "../api/groupsApi";

interface InviteMemberFormProps {
  groupId: string;
  /** userIds already invited or active — these show as disabled in results. */
  existingMemberIds: string[];
  onInvited: () => void;
}

export function InviteMemberForm({ groupId, existingMemberIds, onInvited }: InviteMemberFormProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(query.trim()));
    } catch (searchError) {
      setFormError(getErrorMessage(searchError));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (user: UserSearchResult) => {
    setInvitingId(user.id);
    setFormError(null);
    try {
      await inviteMember(groupId, user.id);
      setQuery("");
      setResults(null);
      addToast(`Invitation sent to ${user.name}.`, "success");
      onInvited();
    } catch (inviteError) {
      setFormError(getErrorMessage(inviteError));
      setInvitingId(null);
    }
  };

  return (
    <div className="invite-form" aria-label="Invite a member">
      <form className="invite-form__search" onSubmit={handleSearch}>
        <div className="field invite-form__field">
          <label htmlFor="invite-search">Find a user</label>
          <input
            id="invite-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
          />
        </div>
        <button className="btn" type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {formError && <Banner tone="error">{formError}</Banner>}

      {results && results.length === 0 && (
        <p className="invite-form__empty">No users match “{query.trim()}”.</p>
      )}

      {results && results.length > 0 && (
        <ul className="rows invite-form__results">
          {results.map((user) => {
            const already = existingMemberIds.includes(user.id);
            return (
              <li key={user.id} className="row">
                <div>
                  <p className="row__primary">{user.name}</p>
                  <p className="row__secondary">{user.email}</p>
                </div>
                <div className="row__meta">
                  <button
                    className="btn btn--sm"
                    type="button"
                    onClick={() => void handleInvite(user)}
                    disabled={invitingId !== null || already}
                  >
                    {invitingId === user.id ? "Inviting…" : "Invite"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}