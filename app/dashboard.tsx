"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompletedSession, ProfileId, ProfileStatus, SessionEndReason } from "@/lib/types";

type DashboardResponse = {
  checkedAt: number;
  profiles: Record<ProfileId, ProfileStatus>;
};

const PROFILE_IDS: ProfileId[] = ["ilan", "ruben", "naim"];
const PROFILE_NAMES: Record<ProfileId, string> = { ilan: "Ilan", ruben: "Ruben", naim: "Naïm" };
const CLIENT_STARTED_AT = Date.now();
const INITIAL_PARIS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(CLIENT_STARTED_AT));

function hoursMinutes(totalSeconds: number) {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function daysHoursMinutes(totalSeconds: number) {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}j ${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function daysHours(totalSeconds: number) {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  return `${Math.floor(totalMinutes / 1440)}j ${Math.floor((totalMinutes % 1440) / 60)}h`;
}

function exactDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`;
}

function percent(value: number) {
  const number = value * 100;
  if (number >= 99.995) return ">99,995 %";
  return `${number.toFixed(number < 10 ? 2 : 1).replace(".", ",")} %`;
}

function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function parisDateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateInput(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
}

function statusLabel(profile: ProfileStatus | undefined) {
  const state = profile?.state;
  if (!state) return "INITIALISATION";
  if (state.isAfkWorld) return "AFK WORLD";
  if (state.isInkGame) return "INK GAME";
  if (state.presence === "Offline") return "OFFLINE";
  if (state.presence === "In Game") return "AUTRE JEU";
  return state.presence.toUpperCase();
}

function statusTone(profile: ProfileStatus | undefined) {
  if (profile?.state?.isAfkWorld) return "good";
  if (profile?.state?.presence === "Offline") return "bad";
  return "warn";
}

function endReasonLabel(reason: SessionEndReason) {
  const labels: Record<SessionEndReason, string> = {
    offline: "Offline",
    ink_game: "Ink Game",
    other_game: "Autre jeu",
    online: "En ligne",
    studio: "Roblox Studio",
    invisible: "Invisible",
    unknown: "Inconnu",
    manual: "Manuel",
  };
  return labels[reason];
}

type SessionDraft = {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  rewardIntervalMinutes: number;
  rewardsEarned: number;
  creditedMinutes: number;
  endReason: SessionEndReason;
  endLabel: string;
  reason: string;
};

function sessionDraft(session: CompletedSession): SessionDraft {
  return {
    startedAt: dateInput(session.startedAt),
    endedAt: dateInput(session.endedAt),
    durationSeconds: session.durationSeconds,
    rewardIntervalMinutes: session.rewardIntervalMinutes,
    rewardsEarned: session.rewardsEarned,
    creditedMinutes: session.creditedAfkSeconds / 60,
    endReason: session.endReason,
    endLabel: session.endLabel,
    reason: "Correction de session",
  };
}

function SessionModal({
  session,
  admin,
  onClose,
  onSave,
}: {
  session: CompletedSession;
  admin: boolean;
  onClose: () => void;
  onSave: (draft: SessionDraft) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => sessionDraft(session));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function syncDates(startedAt: string, endedAt: string) {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const durationSeconds = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.floor((end - start) / 1000))
      : draft.durationSeconds;
    const rewards = Math.floor(durationSeconds / (draft.rewardIntervalMinutes * 60));
    setDraft({
      ...draft,
      startedAt,
      endedAt,
      durationSeconds,
      rewardsEarned: rewards,
      creditedMinutes: rewards * draft.rewardIntervalMinutes,
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal card" role="dialog" aria-modal="true" aria-label="Détail de la session" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">SESSION</span><h2>Détail complet</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {!editing ? (
          <div className="session-detail-grid">
            <div><span>Début</span><b>{dateTime(session.startedAt)}</b></div>
            <div><span>Fin</span><b>{dateTime(session.endedAt)}</b></div>
            <div><span>Durée réelle</span><b>{exactDuration(session.durationSeconds)}</b></div>
            <div><span>Temps crédité</span><b>{hoursMinutes(session.creditedAfkSeconds)}</b></div>
            <div><span>Récompenses gagnées</span><b>{session.rewardsEarned}</b></div>
            <div><span>Intervalle</span><b>{session.rewardIntervalMinutes} min</b></div>
            <div><span>Total AFK avant</span><b>{hoursMinutes(session.totalAfkBefore)}</b></div>
            <div><span>Total AFK après</span><b>{hoursMinutes(session.totalAfkAfter)}</b></div>
            <div><span>Récompenses avant</span><b>{session.totalRewardsBefore}</b></div>
            <div><span>Récompenses après</span><b>{session.totalRewardsAfter}</b></div>
            <div><span>Fin / raison</span><b>{endReasonLabel(session.endReason)} · {session.endLabel}</b></div>
            <div><span>Source</span><b>{session.source === "admin" ? "Modifiée manuellement" : "Automatique"}</b></div>
          </div>
        ) : (
          <div className="admin-form session-edit-form">
            <label>Début<input type="datetime-local" step="1" value={draft.startedAt} onChange={(event) => syncDates(event.target.value, draft.endedAt)} /></label>
            <label>Fin<input type="datetime-local" step="1" value={draft.endedAt} onChange={(event) => syncDates(draft.startedAt, event.target.value)} /></label>
            <label>Durée réelle (secondes)<input type="number" min="0" value={draft.durationSeconds} onChange={(event) => {
              const durationSeconds = Math.max(0, Number(event.target.value));
              const start = new Date(draft.startedAt).getTime();
              const rewards = Math.floor(durationSeconds / (draft.rewardIntervalMinutes * 60));
              setDraft({ ...draft, durationSeconds, endedAt: dateInput(start + durationSeconds * 1000), rewardsEarned: rewards, creditedMinutes: rewards * draft.rewardIntervalMinutes });
            }} /></label>
            <label>Intervalle (minutes)<input type="number" min="1" value={draft.rewardIntervalMinutes} onChange={(event) => {
              const interval = Math.max(1, Number(event.target.value));
              const rewards = Math.floor(draft.durationSeconds / (interval * 60));
              setDraft({ ...draft, rewardIntervalMinutes: interval, rewardsEarned: rewards, creditedMinutes: rewards * interval });
            }} /></label>
            <label>Récompenses<input type="number" min="0" value={draft.rewardsEarned} onChange={(event) => {
              const rewards = Math.max(0, Math.floor(Number(event.target.value)));
              setDraft({ ...draft, rewardsEarned: rewards, creditedMinutes: rewards * draft.rewardIntervalMinutes });
            }} /></label>
            <label>Temps crédité (minutes)<input type="number" min="0" step={draft.rewardIntervalMinutes} value={draft.creditedMinutes} onChange={(event) => {
              const requested = Math.max(0, Number(event.target.value));
              const rewards = Math.floor(requested / draft.rewardIntervalMinutes);
              setDraft({ ...draft, rewardsEarned: rewards, creditedMinutes: rewards * draft.rewardIntervalMinutes });
            }} /></label>
            <label>Type de fin<select value={draft.endReason} onChange={(event) => setDraft({ ...draft, endReason: event.target.value as SessionEndReason })}>
              <option value="offline">Offline</option><option value="ink_game">Ink Game</option><option value="other_game">Autre jeu</option>
              <option value="online">En ligne</option><option value="studio">Roblox Studio</option><option value="invisible">Invisible</option>
              <option value="unknown">Inconnu</option><option value="manual">Manuel</option>
            </select></label>
            <label>Libellé de fin<input value={draft.endLabel} onChange={(event) => setDraft({ ...draft, endLabel: event.target.value })} /></label>
            <label className="wide">Motif de correction<input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></label>
          </div>
        )}

        {error && <div className="error compact">{error}</div>}
        <div className="modal-actions">
          {admin && !editing && <button className="button secondary" type="button" onClick={() => setEditing(true)}>Modifier la session</button>}
          {editing && <button className="button secondary" type="button" onClick={() => setEditing(false)}>Annuler</button>}
          {editing && <button className="button" type="button" disabled={busy} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</button>}
          {!editing && <button className="button" type="button" onClick={onClose}>Fermer</button>}
        </div>
      </section>
    </div>
  );
}

function Calendar({ sessions, selectedDay, onSelectDay }: { sessions: CompletedSession[]; selectedDay: string; onSelectDay: (day: string) => void }) {
  const todayParts = INITIAL_PARIS_DATE.split("-").map(Number);
  const [cursor, setCursor] = useState({ year: todayParts[0], month: todayParts[1] - 1 });
  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const leading = (firstWeekday + 6) % 7;
  const days = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const sessionMap = useMemo(() => {
    const map = new Map<string, CompletedSession[]>();
    for (const session of sessions) {
      const key = parisDateKey(session.startedAt);
      map.set(key, [...(map.get(key) || []), session]);
    }
    return map;
  }, [sessions]);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  function move(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }

  return (
    <section className="card calendar-card">
      <div className="calendar-head">
        <div><span className="eyebrow">CALENDRIER</span><h2>{monthLabel}</h2></div>
        <div className="calendar-nav"><button type="button" onClick={() => move(-1)} aria-label="Mois précédent">←</button><button type="button" onClick={() => move(1)} aria-label="Mois suivant">→</button></div>
      </div>
      <div className="calendar-grid weekdays">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid days">
        {Array.from({ length: leading }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const daySessions = sessionMap.get(key) || [];
          const qualified = daySessions.some((session) => session.durationSeconds >= 25 * 60);
          return <button type="button" key={key} className={`${qualified ? "qualified" : ""} ${selectedDay === key ? "selected" : ""}`} onClick={() => onSelectDay(key)}><span>{day}</span>{daySessions.length > 0 && <small>{daySessions.length}</small>}</button>;
        })}
      </div>
    </section>
  );
}

function LiveSessionCounter({
  baseSeconds,
  fetchedAt,
  running,
  stale,
}: {
  baseSeconds: number;
  fetchedAt: number;
  running: boolean;
  stale: boolean;
}) {
  const [tick, setTick] = useState(CLIENT_STARTED_AT);
  useEffect(() => {
    if (!running || stale) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, stale]);
  const extra = running && !stale ? Math.min(90, Math.max(0, Math.floor((tick - fetchedAt) / 1000))) : 0;
  return <>{exactDuration(baseSeconds + extra)}</>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [profileId, setProfileId] = useState<ProfileId>("ilan");
  const [sessions, setSessions] = useState<Record<ProfileId, CompletedSession[]>>({ ilan: [], ruben: [], naim: [] });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(INITIAL_PARIS_DATE);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fetchedAt, setFetchedAt] = useState(CLIENT_STARTED_AT);
  const [admin, setAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [secret, setSecret] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Erreur serveur");
      setData(json);
      setFetchedAt(Date.now());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur serveur");
    }
  }, []);

  const loadSessions = useCallback(async (id: ProfileId) => {
    const response = await fetch(`/api/sessions?profile=${id}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Erreur sessions");
    setSessions((current) => ({ ...current, [id]: json.sessions }));
  }, []);

  useEffect(() => {
    const initial = setTimeout(loadStatus, 0);
    const timer = setInterval(loadStatus, 10_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [loadStatus]);

  useEffect(() => {
    const initial = setTimeout(() => {
      loadSessions(profileId).catch((reason) => setError(reason instanceof Error ? reason.message : "Erreur sessions"));
    }, 0);
    return () => clearTimeout(initial);
  }, [loadSessions, profileId]);

  useEffect(() => {
    fetch("/api/admin", { cache: "no-store" }).then((response) => response.json()).then((json) => setAdmin(Boolean(json.authenticated))).catch(() => null);
  }, []);

  const profile = data?.profiles[profileId];
  const tone = statusTone(profile);
  const state = profile?.state;
  const profileSessions = sessions[profileId];
  const selectedSession = useMemo(
    () => profileSessions.find((session) => session.id === selectedSessionId) || null,
    [profileSessions, selectedSessionId],
  );
  const selectedDaySessions = useMemo(
    () => profileSessions.filter((session) => parisDateKey(session.startedAt) === selectedDay),
    [profileSessions, selectedDay],
  );
  const privacyProblem = state?.presence === "In Game" && state.placeId == null;

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setAdminBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Connexion refusée");
      setAdmin(true);
      setShowLogin(false);
      setSecret("");
      setNotice("Mode admin activé.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur admin");
    } finally {
      setAdminBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAdmin(false);
    setShowAdminPanel(false);
  }

  async function postAdmin(body: Record<string, unknown>) {
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, profileId }) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Modification refusée");
    await Promise.all([loadStatus(), loadSessions(profileId)]);
    setNotice("Modification enregistrée et totaux recalculés.");
  }

  async function saveSession(draft: SessionDraft) {
    if (!selectedSession) return;
    await postAdmin({
      action: "update_session",
      sessionId: selectedSession.id,
      startedAt: new Date(draft.startedAt).getTime(),
      endedAt: new Date(draft.endedAt).getTime(),
      durationSeconds: draft.durationSeconds,
      rewardIntervalMinutes: draft.rewardIntervalMinutes,
      rewardsEarned: draft.rewardsEarned,
      creditedAfkSeconds: draft.creditedMinutes * 60,
      endReason: draft.endReason,
      endLabel: draft.endLabel,
      reason: draft.reason,
    });
    setSelectedSessionId(null);
  }

  return (
    <main className={`shell theme-${tone}`}>
      <header>
        <div>
          <div className="eyebrow">INK GAME · @{profile?.config.username || "xx_nalyy"}</div>
          <h1>AFK Tracker</h1>
        </div>
        <div className="header-actions">
          <button className="admin-trigger" type="button" onClick={() => admin ? setShowAdminPanel((value) => !value) : setShowLogin(true)}>{admin ? "ADMIN ACTIF" : "ADMIN"}</button>
          <div className={`status ${tone}`}><span className="dot" /> {statusLabel(profile)}</div>
        </div>
      </header>

      <nav className="profile-tabs" aria-label="Profils">
        {PROFILE_IDS.map((id) => <button key={id} type="button" className={id === profileId ? "active" : ""} onClick={() => { setProfileId(id); setSelectedSessionId(null); }}>{PROFILE_NAMES[id]}</button>)}
      </nav>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}
      {profile?.live.stale && <div className="warning">⚠️ Le tracker n’a pas reçu de vérification récente. Les compteurs live sont temporairement figés.</div>}
      {privacyProblem && <div className="warning">⚠️ Roblox indique que ce compte joue mais masque le Place ID. Activez la visibilité de l’expérience actuelle dans Roblox.</div>}

      {admin && showAdminPanel && profile && (
        <section className="card admin-panel">
          <div className="section-title"><div><span className="eyebrow">ADMINISTRATION</span><h2>{profile.config.displayName}</h2></div><button className="text-button" type="button" onClick={logout}>Déconnexion</button></div>
          <div className="admin-columns">
            <form className="admin-form" onSubmit={async (event) => {
              event.preventDefault(); const form = new FormData(event.currentTarget); setAdminBusy(true);
              try { await postAdmin({ action: "update_totals", totalAfkMinutes: form.get("totalAfkMinutes"), totalRewards: form.get("totalRewards"), reason: form.get("reason") }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); } finally { setAdminBusy(false); }
            }}>
              <h3>Totaux actuels</h3>
              <label>Temps AFK total (minutes)<input name="totalAfkMinutes" type="number" min="0" step="1" defaultValue={Math.floor(profile.totals.totalAfkSeconds / 60)} /></label>
              <label>Récompenses totales<input name="totalRewards" type="number" min="0" step="1" defaultValue={profile.totals.totalRewards} /></label>
              <label className="wide">Motif<input name="reason" defaultValue="Correction manuelle des totaux" /></label>
              <button className="button" disabled={adminBusy}>Corriger les totaux</button>
            </form>
            <form className="admin-form" onSubmit={async (event) => {
              event.preventDefault(); const form = new FormData(event.currentTarget); setAdminBusy(true);
              try { await postAdmin({ action: "update_base", baseAfkMinutes: form.get("baseAfkMinutes"), baseRewards: form.get("baseRewards"), reason: form.get("reason") }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); } finally { setAdminBusy(false); }
            }}>
              <h3>Valeurs de base</h3>
              <label>Temps de base (minutes)<input name="baseAfkMinutes" type="number" min="0" step="1" defaultValue={Math.floor(profile.totals.baseAfkSeconds / 60)} /></label>
              <label>Récompenses de base<input name="baseRewards" type="number" min="0" step="1" defaultValue={profile.totals.baseRewards} /></label>
              <label className="wide">Motif<input name="reason" defaultValue="Correction des valeurs de base" /></label>
              <button className="button" disabled={adminBusy}>Modifier la base</button>
            </form>
          </div>
        </section>
      )}

      <section className="hero card">
        <div><span className="muted">Compte</span><strong>@{profile?.config.username || "—"}</strong></div>
        <div><span className="muted">Début de session AFK</span><strong>{profile?.live.sessionStartedAt ? dateTime(profile.live.sessionStartedAt) : "—"}</strong></div>
        <div><span className="muted">Session connectée actuelle</span><strong>{profile?.live.sessionStartedAt ? <LiveSessionCounter baseSeconds={profile.live.currentSessionSeconds} fetchedAt={fetchedAt} running={Boolean(state?.isAfkWorld)} stale={profile.live.stale} /> : "—"}</strong></div>
        <div><span className="muted">Dernière vérification</span><strong>{state ? dateTime(state.lastCheckedAt) : "—"}</strong></div>
      </section>

      <section className="grid stats-grid">
        <article className="card stat primary"><span className="muted">AFK total cumulé</span><strong>{profile ? hoursMinutes(profile.totals.totalAfkSeconds) : "—"}</strong><small>{profile ? `≈ ${daysHoursMinutes(profile.totals.totalAfkSeconds)}` : "—"}</small></article>
        <article className="card stat"><span className="muted">Récompenses estimées</span><strong>{profile?.totals.totalRewards ?? "—"}</strong><small>{profile ? `1 récompense par session, tous les ${profile.config.rewardIntervalMinutes} min complets` : "—"}</small></article>
        <article className="card stat status-stat"><span className="muted">Sessions aujourd’hui</span><strong>{profile?.sessionsToday ?? "—"}</strong><small>depuis 00:00 · heure Europe/Paris</small></article>
      </section>

      <section className="grid target-grid">
        <article className="card target">
          <div className="target-head"><div><span className="pill">0,14 % / récompense</span><h2>🏷️ Titre</h2></div><strong>{profile ? percent(profile.totals.titleChance) : "—"}</strong></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (profile?.totals.titleChance || 0) * 100)}%` }} /></div>
          <div className="target-details">
            <div><span>Estimé restant avant la moyenne</span><b>{profile ? `${profile.totals.titleRemainingRewards} récompenses` : "—"}</b></div>
            <div><span>Temps correspondant</span><b>{profile ? <>{daysHours(profile.totals.titleRemainingSeconds)}<small>{hoursMinutes(profile.totals.titleRemainingSeconds)}</small></> : "—"}</b></div>
            <div><span>Moyenne théorique</span><b>~714 récompenses</b></div>
          </div>
        </article>
        <article className="card target">
          <div className="target-head"><div><span className="pill">0,04 % / récompense</span><h2>⚡ Ultra Instinct</h2></div><strong>{profile ? percent(profile.totals.ultraChance) : "—"}</strong></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (profile?.totals.ultraChance || 0) * 100)}%` }} /></div>
          <div className="target-details">
            <div><span>Estimé restant avant la moyenne</span><b>{profile ? `${profile.totals.ultraRemainingRewards} récompenses` : "—"}</b></div>
            <div><span>Temps correspondant</span><b>{profile ? <>{daysHours(profile.totals.ultraRemainingSeconds)}<small>{hoursMinutes(profile.totals.ultraRemainingSeconds)}</small></> : "—"}</b></div>
            <div><span>Moyenne théorique</span><b>2500 récompenses</b></div>
          </div>
        </article>
      </section>

      <section className="card current">
        <div><span className="eyebrow">STATUT ROBLOX</span><h2>{state?.isAfkWorld ? "Ink Game · AFK World" : state?.isInkGame ? "Ink Game" : state?.lastLocation || state?.presence || "En attente"}</h2></div>
        <div className="placeid"><span>Place ID</span><code>{state?.placeId ?? "—"}</code></div>
      </section>

      <Calendar sessions={profileSessions} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      <section className="card day-sessions">
        <div className="section-title"><div><span className="eyebrow">JOUR SÉLECTIONNÉ</span><h2>{selectedDay.split("-").reverse().join("/")}</h2></div><span className="muted">{selectedDaySessions.length} session(s)</span></div>
        {selectedDaySessions.length === 0 ? <div className="empty">Aucune session enregistrée ce jour-là.</div> : <div className="compact-sessions">{selectedDaySessions.map((session) => <button type="button" key={session.id} onClick={() => setSelectedSessionId(session.id)}><b>{dateTime(session.startedAt)}</b><span>{exactDuration(session.durationSeconds)} · {session.rewardsEarned} récompense(s)</span></button>)}</div>}
      </section>

      <section className="lower-grid">
        <article className="card history">
          <div className="section-title"><div><span className="eyebrow">HISTORIQUE</span><h2>Logs</h2></div><span className="muted">{profile?.stats.checks || 0} vérifications</span></div>
          {!profile?.logs.length ? <div className="empty">Le tracker commencera les logs dès sa première vérification.</div> : <div className="events">{profile.logs.map((item) => <div className="event" key={item.id}><span className={`event-icon ${item.kind === "session_started" ? "good" : item.kind === "session_ended" ? "warn" : item.kind === "admin_change" ? "admin" : ""}`} /><div className="event-body"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{dateTime(item.at)}</time></div>)}</div>}
        </article>
        <article className="card sessions-card">
          <div className="section-title"><div><span className="eyebrow">HISTORIQUE</span><h2>Sessions</h2></div><span className="muted">{profileSessions.length} au total</span></div>
          {profileSessions.length === 0 ? <div className="empty">Aucune session terminée pour ce profil.</div> : <div className="session-list">{profileSessions.map((session) => <button type="button" key={session.id} onClick={() => setSelectedSessionId(session.id)}><span><b>{dateTime(session.startedAt)}</b><small>{session.endLabel}</small></span><span className="session-metrics"><b>{exactDuration(session.durationSeconds)}</b><small>{session.rewardsEarned} récompense(s) · {hoursMinutes(session.creditedAfkSeconds)} créditées</small></span></button>)}</div>}
        </article>
      </section>

      <footer><span>Le site se met à jour toutes les 10 s · les trois comptes sont vérifiés dans une requête batch.</span><span>Les objectifs 714 / 2500 sont des moyennes statistiques, jamais des garanties.</span></footer>

      {showLogin && <div className="modal-backdrop" onMouseDown={() => setShowLogin(false)}><form className="modal login-modal card" onSubmit={login} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">ADMINISTRATION</span><h2>Connexion</h2></div><button className="icon-button" type="button" onClick={() => setShowLogin(false)}>×</button></div><label className="secret-label">Secret admin<input type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} autoFocus /></label><button className="button" disabled={adminBusy}>{adminBusy ? "Vérification…" : "Se connecter"}</button></form></div>}
      {selectedSession && <SessionModal key={`${selectedSession.id}-${selectedSession.updatedAt}`} session={selectedSession} admin={admin} onClose={() => setSelectedSessionId(null)} onSave={saveSession} />}
    </main>
  );
}
