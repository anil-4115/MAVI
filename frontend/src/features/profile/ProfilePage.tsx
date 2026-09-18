import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { Banner } from "../../components/ui/Banner";
import { useToast } from "../../components/ui/Toast";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../services/api";
import { useAuth } from "../auth/useAuth";
import { validateName } from "../auth/validation";
import { updateMyProfile } from "../users/api/usersApi";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemePreference } from "../../theme/ThemeProvider";
import "./profile.css";

type ProfileTab = "profile" | "settings" | "help";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help & Support" },
];

const THEME_OPTIONS: { id: ThemePreference; label: string; description: string }[] = [
  { id: "blue", label: "Blue + White", description: "MAVI's default look." },
  { id: "light", label: "Light", description: "Bright, high contrast." },
  { id: "dark", label: "Dark", description: "Easy on the eyes at night." },
  { id: "system", label: "System", description: "Follows this device's setting." },
];

const RESOLVED_THEME_LABELS: Record<string, string> = {
  blue: "Blue + White",
  light: "Light",
  dark: "Dark",
};

function ProfileInfo() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  const [draftName, setDraftName] = useState(user?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return null;
  }

  const isDirty = draftName.trim() !== user.name;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const nameError = validateName(draftName);
    setFieldErrors({ name: nameError });
    setFormError(null);
    if (nameError) {
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyProfile({ name: draftName.trim() });
      updateUser(updated);
      setDraftName(updated.name);
      addToast("Profile updated.", "success");
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraft = () => {
    setDraftName(user.name);
    setFieldErrors({});
    setFormError(null);
  };

  return (
    <div className="profile-profile">
      <section className="card profile-card">
        <div className="profile-card__identity">
          <Avatar name={user.name} size="lg" />
          <div>
            <h2 className="profile-card__name">{user.name}</h2>
            <p className="profile-card__email">{user.email}</p>
            <p className="profile-card__meta">Joined {formatDate(user.createdAt)}</p>
          </div>
        </div>
        <dl className="profile-card__details">
          <div>
            <dt>Account status</dt>
            <dd>
              <span className="badge badge--success">Active</span>
            </dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h3 className="card__title">Edit profile</h3>
        <p className="form-hint">Your name is shown to the people you split expenses with.</p>

        {formError && (
          <Banner tone="error">{formError}</Banner>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className={`field${fieldErrors.name ? " field--invalid" : ""}`}>
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              maxLength={100}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "profile-name-error" : undefined}
            />
            {fieldErrors.name && (
              <span id="profile-name-error" className="field__error">
                {fieldErrors.name}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={user.email} disabled readOnly />
            <p className="form-hint">Email is read-only — it is your sign-in identifier.</p>
          </div>

          <div className="form__actions">
            <button className="btn" type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            {isDirty && !isSaving && (
              <button className="btn btn--secondary" type="button" onClick={resetDraft}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function SettingsTab() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const resolvedLabel = RESOLVED_THEME_LABELS[resolvedTheme] ?? resolvedTheme;

  return (
    <div className="profile-settings">
      <section className="card">
        <h3 className="card__title">Appearance</h3>
        <p className="form-hint">Choose how MAVI looks on this device. Your choice is remembered locally.</p>
        <div className="segmented" role="radiogroup" aria-label="Theme" aria-describedby="theme-current">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={preference === option.id}
              title={option.description}
              className={`segmented__option${preference === option.id ? " segmented__option--active" : ""}`}
              onClick={() => setPreference(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p id="theme-current" className="form-hint" role="status">
          Currently showing <strong>{resolvedLabel}</strong>
          {preference === "system" ? " (matching your device)." : "."}
        </p>
      </section>

      <section className="card">
        <h3 className="card__title">Account</h3>
        <p className="form-hint">
          Your email and password belong to your sign-in. Changing them isn't available in this build.
        </p>
        <p className="form-hint">Notifications live in the Activity feed and update automatically.</p>
      </section>

      <section className="card">
        <h3 className="card__title">About MAVI</h3>
        <dl className="profile-card__details">
          <div>
            <dt>Version</dt>
            <dd>2026.1</dd>
          </div>
          <div>
            <dt>Made for</dt>
            <dd>Splitting smartly, together.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do expenses get split?",
    a: "Add a shared expense in a group and choose a split method — equal, quantity, exact amount, percentage, shares, or item-wise. The backend computes each member's share; the UI only shows the returned amounts.",
  },
  {
    q: "What does my balance mean?",
    a: "Your net balance is what the group owes you (positive) or what you owe the group (negative), derived from recorded expenses and completed settlements.",
  },
  {
    q: "Can I clear a debt?",
    a: "Yes — in Balances, a suggested settlement tells you who should pay whom. Record the settlement in that group and balances update automatically.",
  },
  {
    q: "Is my data safe?",
    a: "Every add, edit, or void is subject to server-side authorization, and money is always computed on the backend.",
  },
];

function HelpTab() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="profile-help">
      <section className="card">
        <h3 className="card__title">Frequently asked questions</h3>
        <ul className="faq-list">
          {FAQS.map((faq, index) => (
            <li key={faq.q} className="faq-item">
              <button
                type="button"
                className="faq-item__question"
                aria-expanded={open === index}
                onClick={() => setOpen(open === index ? null : index)}
              >
                <span>{faq.q}</span>
                <span className="faq-item__chevron" aria-hidden="true">
                  {open === index ? "−" : "+"}
                </span>
              </button>
              {open === index && <p className="faq-item__answer">{faq.a}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="card__title">Contact support</h3>
        <p className="form-hint">
          Reach out for help or feature requests — it lands directly with the team.
        </p>
        <a className="btn" href="mailto:support@mavi.app?subject=MAVI%20support">
          Email support
        </a>
      </section>
    </div>
  );
}

export function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as ProfileTab | null;
  const [tab, setTab] = useState<ProfileTab>(requested && TABS.some((t) => t.id === requested) ? requested : "profile");

  const selectTab = (next: ProfileTab): void => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === "profile") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    setSearchParams(query ? `?${query}` : {}, { replace: true });
  };

  return (
    <div className="app-page profile-page">
      <div className="tabs" role="tablist" aria-label="Profile sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`tab${tab === entry.id ? " tab--active" : ""}`}
            onClick={() => selectTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileInfo />}
      {tab === "settings" && <SettingsTab />}
      {tab === "help" && <HelpTab />}
    </div>
  );
}