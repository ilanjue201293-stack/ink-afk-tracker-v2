"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AchievementId, AchievementRecord, CompletedSession, ProfileId, ProfileStatus, SessionEndReason } from "@/lib/types";

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

function achievementText(achievement: AchievementRecord | null | undefined) {
  if (!achievement) return "Pas encore confirmé";
  return `✅ Obtenu le ${dateTime(achievement.obtainedAt)} · ${achievement.totalRewardsAt} récompense(s) · ${hoursMinutes(achievement.totalAfkSecondsAt)} AFK`;
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

function PencilButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="pencil-button" type="button" aria-label={label} title={label} onClick={onClick}>✎</button>;
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
  synchronized: boolean;
  totalAfkBefore: number;
  totalAfkAfter: number;
  totalRewardsBefore: number;
  totalRewardsAfter: number;
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
    synchronized: session.synchronized !== false,
    totalAfkBefore: session.totalAfkBefore,
    totalAfkAfter: session.totalAfkAfter,
    totalRewardsBefore: session.totalRewardsBefore,
    totalRewardsAfter: session.totalRewardsAfter,
  };
}

function newSessionDraft(intervalMinutes: number, totalAfkSeconds: number, totalRewards: number): SessionDraft {
  const endedAt = Date.now();
  const durationSeconds = intervalMinutes * 60;
  return {
    startedAt: dateInput(endedAt - durationSeconds * 1000),
    endedAt: dateInput(endedAt),
    durationSeconds,
    rewardIntervalMinutes: intervalMinutes,
    rewardsEarned: 1,
    creditedMinutes: intervalMinutes,
    endReason: "manual",
    endLabel: "Session ajoutée manuellement",
    reason: "Ajout manuel d’une session",
    synchronized: true,
    totalAfkBefore: totalAfkSeconds,
    totalAfkAfter: totalAfkSeconds + durationSeconds,
    totalRewardsBefore: totalRewards,
    totalRewardsAfter: totalRewards + 1,
  };
}

function DetailCell({ label, value, admin, onEdit }: { label: string; value: React.ReactNode; admin: boolean; onEdit: () => void }) {
  return (
    <div className="detail-cell">
      <span>{label}</span>
      <div className="detail-value"><b>{value}</b>{admin && <PencilButton label={`Modifier ${label}`} onClick={onEdit} />}</div>
    </div>
  );
}

function SessionModal({
  session,
  admin,
  initialDraft,
  onClose,
  onSave,
  onDelete,
}: {
  session: CompletedSession | null;
  admin: boolean;
  initialDraft?: SessionDraft;
  onClose: () => void;
  onSave: (draft: SessionDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const creating = session === null;
  const [editing, setEditing] = useState(creating);
  const [draft, setDraft] = useState(() => initialDraft || sessionDraft(session as CompletedSession));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeDraft(patch: Partial<SessionDraft>, source: "dates" | "duration" | "other" = "other") {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (!next.synchronized) return next;
      const start = new Date(next.startedAt).getTime();
      let end = new Date(next.endedAt).getTime();
      if (source === "duration" && Number.isFinite(start)) {
        end = start + Math.max(0, next.durationSeconds) * 1000;
        next.endedAt = dateInput(end);
      } else if (Number.isFinite(start) && Number.isFinite(end)) {
        next.durationSeconds = Math.max(0, Math.floor((end - start) / 1000));
      }
      const interval = Math.max(1, next.rewardIntervalMinutes);
      next.rewardIntervalMinutes = interval;
      next.rewardsEarned = Math.floor(next.durationSeconds / (interval * 60));
      next.creditedMinutes = next.rewardsEarned * interval;
      next.totalAfkAfter = next.totalAfkBefore + next.creditedMinutes * 60;
      next.totalRewardsAfter = next.totalRewardsBefore + next.rewardsEarned;
      return next;
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

  async function remove() {
    if (!onDelete || !window.confirm("Supprimer définitivement cette session ? Les totaux seront recalculés.")) return;
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal card" role="dialog" aria-modal="true" aria-label="Détail de la session" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">SESSION</span><h2>{creating ? "Créer une session" : "Détail complet"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {!editing && session ? (
          <div className="session-detail-grid">
            <DetailCell label="Début" value={dateTime(session.startedAt)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Fin" value={dateTime(session.endedAt)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Durée réelle" value={exactDuration(session.durationSeconds)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Temps crédité" value={hoursMinutes(session.creditedAfkSeconds)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Récompenses gagnées" value={session.rewardsEarned} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Intervalle" value={`${session.rewardIntervalMinutes} min`} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Total AFK avant" value={hoursMinutes(session.totalAfkBefore)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Total AFK après" value={hoursMinutes(session.totalAfkAfter)} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Récompenses avant" value={session.totalRewardsBefore} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Récompenses après" value={session.totalRewardsAfter} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Fin / raison" value={`${endReasonLabel(session.endReason)} · ${session.endLabel}`} admin={admin} onEdit={() => setEditing(true)} />
            <DetailCell label="Synchronisation" value={session.synchronized === false ? "Désynchronisée" : "Automatique"} admin={admin} onEdit={() => setEditing(true)} />
            <div className="detail-cell"><span>Source</span><b>{session.source === "admin" ? "Modifiée manuellement" : "Automatique"}</b></div>
          </div>
        ) : (
          <div className="admin-form session-edit-form">
            <label className="wide sync-toggle"><span><input type="checkbox" checked={!draft.synchronized} onChange={(event) => changeDraft({ synchronized: !event.target.checked }, "dates")} /> Désynchroniser les changements</span><small>Décoché : durée, récompenses, crédits et totaux suivent automatiquement.</small></label>
            <label>Début<input type="datetime-local" step="1" value={draft.startedAt} onChange={(event) => changeDraft({ startedAt: event.target.value }, "dates")} /></label>
            <label>Fin<input type="datetime-local" step="1" value={draft.endedAt} onChange={(event) => changeDraft({ endedAt: event.target.value }, "dates")} /></label>
            <label>Durée réelle (secondes)<input type="number" min="0" value={draft.durationSeconds} onChange={(event) => {
              const durationSeconds = Math.max(0, Number(event.target.value));
              changeDraft({ durationSeconds }, "duration");
            }} /></label>
            <label>Intervalle (minutes)<input type="number" min="1" value={draft.rewardIntervalMinutes} onChange={(event) => {
              const interval = Math.max(1, Number(event.target.value));
              changeDraft({ rewardIntervalMinutes: interval });
            }} /></label>
            <label>Récompenses<input type="number" min="0" disabled={draft.synchronized} value={draft.rewardsEarned} onChange={(event) => {
              const rewards = Math.max(0, Math.floor(Number(event.target.value)));
              changeDraft({ rewardsEarned: rewards });
            }} /></label>
            <label>Temps crédité (minutes)<input type="number" min="0" disabled={draft.synchronized} value={draft.creditedMinutes} onChange={(event) => changeDraft({ creditedMinutes: Math.max(0, Number(event.target.value)) })} /></label>
            <label>Type de fin<select value={draft.endReason} onChange={(event) => changeDraft({ endReason: event.target.value as SessionEndReason })}>
              <option value="offline">Offline</option><option value="ink_game">Ink Game</option><option value="other_game">Autre jeu</option>
              <option value="online">En ligne</option><option value="studio">Roblox Studio</option><option value="invisible">Invisible</option>
              <option value="unknown">Inconnu</option><option value="manual">Manuel</option>
            </select></label>
            <label>Libellé de fin<input value={draft.endLabel} onChange={(event) => changeDraft({ endLabel: event.target.value })} /></label>
            {!draft.synchronized && <>
              <label>Total AFK avant (secondes)<input type="number" min="0" value={draft.totalAfkBefore} onChange={(event) => changeDraft({ totalAfkBefore: Math.max(0, Number(event.target.value)) })} /></label>
              <label>Total AFK après (secondes)<input type="number" min="0" value={draft.totalAfkAfter} onChange={(event) => changeDraft({ totalAfkAfter: Math.max(0, Number(event.target.value)) })} /></label>
              <label>Récompenses avant<input type="number" min="0" value={draft.totalRewardsBefore} onChange={(event) => changeDraft({ totalRewardsBefore: Math.max(0, Number(event.target.value)) })} /></label>
              <label>Récompenses après<input type="number" min="0" value={draft.totalRewardsAfter} onChange={(event) => changeDraft({ totalRewardsAfter: Math.max(0, Number(event.target.value)) })} /></label>
            </>}
            <label className="wide">Motif de correction<input value={draft.reason} onChange={(event) => changeDraft({ reason: event.target.value })} /></label>
          </div>
        )}

        {error && <div className="error compact">{error}</div>}
        <div className="modal-actions">
          {admin && !creating && !editing && onDelete && <button className="button danger" type="button" disabled={busy} onClick={remove}>Supprimer</button>}
          {admin && !editing && <button className="button secondary" type="button" onClick={() => setEditing(true)}>Modifier la session</button>}
          {editing && <button className="button secondary" type="button" onClick={creating ? onClose : () => setEditing(false)}>Annuler</button>}
          {editing && <button className="button" type="button" disabled={busy} onClick={save}>{busy ? "Enregistrement…" : creating ? "Créer la session" : "Enregistrer"}</button>}
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
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [showCreateSession, setShowCreateSession] = useState(false);
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
  const selectedSessionIdSet = useMemo(() => new Set(selectedSessionIds), [selectedSessionIds]);
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

  async function postAdmin(body: Record<string, unknown>, successMessage = "Modification enregistrée et totaux recalculés.") {
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, profileId }) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Modification refusée");
    await Promise.all([loadStatus(), loadSessions(profileId)]);
    setNotice(successMessage);
  }

  function sessionPayload(draft: SessionDraft) {
    return {
      startedAt: new Date(draft.startedAt).getTime(),
      endedAt: new Date(draft.endedAt).getTime(),
      durationSeconds: draft.durationSeconds,
      rewardIntervalMinutes: draft.rewardIntervalMinutes,
      rewardsEarned: draft.rewardsEarned,
      creditedAfkSeconds: draft.creditedMinutes * 60,
      totalAfkBefore: draft.totalAfkBefore,
      totalAfkAfter: draft.totalAfkAfter,
      totalRewardsBefore: draft.totalRewardsBefore,
      totalRewardsAfter: draft.totalRewardsAfter,
      endReason: draft.endReason,
      endLabel: draft.endLabel,
      reason: draft.reason,
      synchronized: draft.synchronized,
    };
  }

  async function saveSession(draft: SessionDraft) {
    if (!selectedSession) return;
    await postAdmin({
      action: "update_session",
      sessionId: selectedSession.id,
      ...sessionPayload(draft),
    }, "Session modifiée et données liées recalculées.");
    setSelectedSessionId(null);
  }

  async function createSession(draft: SessionDraft) {
    await postAdmin({ action: "create_session", ...sessionPayload(draft) }, "Session créée et ajoutée aux totaux.");
    setShowCreateSession(false);
  }

  async function deleteSelectedSession() {
    if (!selectedSession) return;
    await postAdmin(
      { action: "delete_session", sessionId: selectedSession.id, reason: "Suppression manuelle depuis le dashboard" },
      "Session supprimée et totaux recalculés.",
    );
    setSelectedSessionId(null);
    setSelectedSessionIds((current) => current.filter((id) => id !== selectedSession.id));
  }

  function toggleSessionSelection(sessionId: string) {
    setSelectedSessionIds((current) => current.includes(sessionId)
      ? current.filter((id) => id !== sessionId)
      : [...current, sessionId]);
  }

  async function mergeSelectedSessions() {
    if (selectedSessionIds.length < 2) return;
    const confirmed = window.confirm(
      `Fusionner ${selectedSessionIds.length} sessions ? La durée couvrira tout le temps entre le premier début et la dernière fin, interruptions comprises.`,
    );
    if (!confirmed) return;
    setAdminBusy(true);
    try {
      await postAdmin(
        {
          action: "merge_sessions",
          sessionIds: selectedSessionIds,
          reason: "Fausse déconnexion corrigée depuis le dashboard",
        },
        `${selectedSessionIds.length} sessions fusionnées et totaux recalculés.`,
      );
      setSelectedSessionIds([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur de fusion");
    } finally {
      setAdminBusy(false);
    }
  }

  async function confirmAchievement(achievementId: AchievementId, label: string) {
    if (!admin || !profile) return;
    if (!window.confirm(`Confirmer l’obtention de ${label} pour ${profile.config.displayName} ?`)) return;
    setAdminBusy(true);
    setError("");
    try {
      await postAdmin(
        { action: "confirm_achievement", achievementId },
        `${label} marqué comme obtenu pour ${profile.config.displayName}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur de confirmation");
    } finally {
      setAdminBusy(false);
    }
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
        {PROFILE_IDS.map((id) => <button key={id} type="button" className={id === profileId ? "active" : ""} onClick={() => { setProfileId(id); setSelectedSessionId(null); setSelectedSessionIds([]); setShowCreateSession(false); }}>{PROFILE_NAMES[id]}</button>)}
      </nav>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}
      {profile?.live.stale && <div className="warning">⚠️ Le tracker n’a pas reçu de vérification récente. Les compteurs live sont temporairement figés.</div>}
      {profile?.live.disconnectPending && <div className="warning">⏳ Déconnexion détectée une fois : la session reste ouverte en attendant le prochain scan.</div>}
      {privacyProblem && <div className="warning">⚠️ Roblox indique que ce compte joue mais masque le Place ID. Activez la visibilité de l’expérience actuelle dans Roblox.</div>}

      {admin && showAdminPanel && profile && (
        <section className="card admin-panel" key={`${profileId}-${profile.totals.totalAfkSeconds}-${profile.totals.totalRewards}-${profile.totals.baseAfkSeconds}-${profile.totals.baseRewards}`}>
          <div className="section-title"><div><span className="eyebrow">ADMINISTRATION</span><h2>{profile.config.displayName}</h2></div><button className="text-button" type="button" onClick={logout}>Déconnexion</button></div>
          <p className="admin-help">Les crayons ouvrent les données modifiables. Les valeurs liées sont recalculées automatiquement, sauf pour une session volontairement désynchronisée.</p>
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
        <article className="card stat primary">{admin && <PencilButton label="Modifier le temps AFK total" onClick={() => setShowAdminPanel(true)} />}<span className="muted">AFK total cumulé</span><strong>{profile ? hoursMinutes(profile.totals.totalAfkSeconds) : "—"}</strong><small>{profile ? `≈ ${daysHoursMinutes(profile.totals.totalAfkSeconds)}` : "—"}</small></article>
        <article className="card stat">{admin && <PencilButton label="Modifier les récompenses totales" onClick={() => setShowAdminPanel(true)} />}<span className="muted">Récompenses estimées</span><strong>{profile?.totals.totalRewards ?? "—"}</strong><small>{profile ? `1 récompense par session, tous les ${profile.config.rewardIntervalMinutes} min complets` : "—"}</small></article>
        <article className="card stat status-stat">{admin && <PencilButton label="Créer une session" onClick={() => setShowCreateSession(true)} />}<span className="muted">Sessions aujourd’hui</span><strong>{profile?.sessionsToday ?? "—"}</strong><small>depuis 00:00 · heure Europe/Paris</small></article>
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
          <div className="session-admin-toolbar">
            <small>{achievementText(profile?.achievements.title)}</small>
            {admin && profile && !profile.achievements.title && <button className="button" type="button" disabled={adminBusy} onClick={() => confirmAchievement("title", "Titre")}>Confirmer l’obtention</button>}
          </div>
        </article>
        <article className="card target">
          <div className="target-head"><div><span className="pill">0,04 % / récompense</span><h2>⚡ Mythic Power</h2></div><strong>{profile ? percent(profile.totals.ultraChance) : "—"}</strong></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (profile?.totals.ultraChance || 0) * 100)}%` }} /></div>
          <div className="target-details">
            <div><span>Estimé restant avant la moyenne</span><b>{profile ? `${profile.totals.ultraRemainingRewards} récompenses` : "—"}</b></div>
            <div><span>Temps correspondant</span><b>{profile ? <>{daysHours(profile.totals.ultraRemainingSeconds)}<small>{hoursMinutes(profile.totals.ultraRemainingSeconds)}</small></> : "—"}</b></div>
            <div><span>Moyenne théorique</span><b>2500 récompenses</b></div>
          </div>
          <div className="session-admin-toolbar">
            <small><b>Ultra Instinct</b> · {achievementText(profile?.achievements.ultra_instinct)}</small>
            {admin && profile && !profile.achievements.ultra_instinct && <button className="button" type="button" disabled={adminBusy} onClick={() => confirmAchievement("ultra_instinct", "Ultra Instinct")}>Confirmer Ultra Instinct</button>}
            <small><b>Rumor</b> · {achievementText(profile?.achievements.rumor)}</small>
            {admin && profile && !profile.achievements.rumor && <button className="button" type="button" disabled={adminBusy} onClick={() => confirmAchievement("rumor", "Rumor")}>Confirmer Rumor</button>}
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
          {admin && <div className="session-admin-toolbar">
            <button className="button" type="button" onClick={() => setShowCreateSession(true)}>+ Nouvelle session</button>
            <button className="button secondary" type="button" disabled={adminBusy || selectedSessionIds.length < 2} onClick={mergeSelectedSessions}>Fusionner ({selectedSessionIds.length})</button>
            <small>Sélectionne plusieurs sessions pour réunir une fausse coupure, interruption comprise.</small>
          </div>}
          {profileSessions.length === 0 ? <div className="empty">Aucune session terminée pour ce profil.</div> : <div className="session-list">{profileSessions.map((session) => <div className="session-row" key={session.id}>{admin && <label className="session-select" title="Sélectionner pour fusionner"><input type="checkbox" checked={selectedSessionIdSet.has(session.id)} onChange={() => toggleSessionSelection(session.id)} /><span /></label>}<button type="button" onClick={() => setSelectedSessionId(session.id)}><span><b>{dateTime(session.startedAt)}</b><small>{session.endLabel}{session.synchronized === false ? " · désynchronisée" : ""}</small></span><span className="session-metrics"><b>{exactDuration(session.durationSeconds)}</b><small>{session.rewardsEarned} récompense(s) · {hoursMinutes(session.creditedAfkSeconds)} créditées</small></span>{admin && <span className="row-pencil" aria-hidden="true">✎</span>}</button></div>)}</div>}
        </article>
      </section>

      <footer><span>Le site se met à jour toutes les 10 s · les trois comptes sont vérifiés dans une requête batch.</span><span>Les objectifs 714 / 2500 sont des moyennes statistiques, jamais des garanties.</span></footer>

      {showLogin && <div className="modal-backdrop" onMouseDown={() => setShowLogin(false)}><form className="modal login-modal card" onSubmit={login} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">ADMINISTRATION</span><h2>Connexion</h2></div><button className="icon-button" type="button" onClick={() => setShowLogin(false)}>×</button></div><label className="secret-label">Secret admin<input type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} autoFocus /></label><button className="button" disabled={adminBusy}>{adminBusy ? "Vérification…" : "Se connecter"}</button></form></div>}
      {selectedSession && <SessionModal key={`${selectedSession.id}-${selectedSession.updatedAt}`} session={selectedSession} admin={admin} onClose={() => setSelectedSessionId(null)} onSave={saveSession} onDelete={deleteSelectedSession} />}
      {showCreateSession && profile && <SessionModal key={`new-${profileId}`} session={null} admin={admin} initialDraft={newSessionDraft(profile.config.rewardIntervalMinutes, profile.totals.totalAfkSeconds, profile.totals.totalRewards)} onClose={() => setShowCreateSession(false)} onSave={createSession} />}
    </main>
  );
}
