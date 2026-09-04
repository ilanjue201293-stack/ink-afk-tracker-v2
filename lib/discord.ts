import { PROFILES } from "./config";
import type { CompletedSession, EngineEffect, ProfileId } from "./types";

function hoursMinutes(totalSeconds: number) {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60));
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function discordTimestamp(ms: number) {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function basePayload(title: string, fields: Array<{ name: string; value: string; inline?: boolean }>, timestamp: number) {
  return {
    embeds: [
      {
        title,
        fields,
        footer: { text: "Ink AFK Tracker V2 · @xx_nalyy" },
        timestamp: new Date(timestamp).toISOString(),
      },
    ],
  };
}

export function buildSessionStartPayload(startedAt: number, totalAfkBefore: number, totalRewardsBefore: number) {
  return basePayload(
    "▶️ Début de session AFK",
    [
      { name: "Début de session", value: discordTimestamp(startedAt), inline: true },
      { name: "AFK total avant", value: hoursMinutes(totalAfkBefore), inline: true },
      { name: "Récompenses avant", value: String(totalRewardsBefore), inline: true },
    ],
    startedAt,
  );
}

export function buildSessionEndPayload(session: CompletedSession) {
  return basePayload(
    "⏹️ Fin de session AFK",
    [
      { name: "Début", value: discordTimestamp(session.startedAt), inline: true },
      { name: "Fin", value: discordTimestamp(session.endedAt), inline: true },
      { name: "Durée réelle", value: hoursMinutes(session.durationSeconds), inline: true },
      { name: "AFK total avant", value: hoursMinutes(session.totalAfkBefore), inline: true },
      { name: "AFK total après", value: hoursMinutes(session.totalAfkAfter), inline: true },
      { name: "Récompenses gagnées", value: String(session.rewardsEarned), inline: true },
      { name: "Récompenses avant", value: String(session.totalRewardsBefore), inline: true },
      { name: "Récompenses après", value: String(session.totalRewardsAfter), inline: true },
      { name: "Statut de sortie", value: session.endLabel, inline: true },
    ],
    session.endedAt,
  );
}

export function webhookEnabled(profileId: ProfileId) {
  return PROFILES[profileId].webhookEnabled;
}

async function postWebhook(payload: unknown) {
  const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) return { sent: false, reason: "DISCORD_WEBHOOK_URL absent" };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Webhook Discord ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return { sent: true };
}

export async function deliverEffect(effect: EngineEffect) {
  if (!webhookEnabled(effect.profileId)) return { profileId: effect.profileId, type: effect.type, sent: false, reason: "désactivé" };
  const payload = effect.type === "session_started"
    ? buildSessionStartPayload(effect.startedAt, effect.totalAfkBefore, effect.totalRewardsBefore)
    : buildSessionEndPayload(effect.session);
  try {
    return { profileId: effect.profileId, type: effect.type, ...(await postWebhook(payload)) };
  } catch (error) {
    return {
      profileId: effect.profileId,
      type: effect.type,
      sent: false,
      reason: error instanceof Error ? error.message : "Erreur Discord",
    };
  }
}
