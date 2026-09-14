import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { formatDate } from "../../lib/format";
import { useAuth } from "../auth/useAuth";
import "./profile.css";

type ThemePreference = "system" | "light" | "dark";

type ProfileTab = "profile" | "settings" | "help";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help & Support" },
];

const THEME_STORAGE_KEY = "mavi-theme";

function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  });

  useEffect(() => {
    applyTheme(preference);
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  return [preference, setPreference];
}

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function ProfileInfo() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }
  return (
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
  );
}

function SettingsTab() {
  const [preference, setPreference] = useThemePreference();

  return (
    <div className="profile-settings">
      <section className="card">
        <h3 className="card__title">Appearance</h3>
        <p className="form-hint">Choose how MAVI looks on this device.</p>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={preference === option.id}
              className={`segmented__option${preference === option.id ? " segmented__option--active" : ""}`}
              onClick={() => setPreference(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card__title">Account</h3>
        <p className="form-hint">
          Email and password changes are managed through your account on the current build.
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