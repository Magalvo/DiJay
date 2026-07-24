import type { QueueSnapshot, Track } from "../../domain/music/track.js";

export function formatDuration(durationMs: number, isStream: boolean): string {
  if (isStream) {
    return "LIVE";
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const minuteAndSecond = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${minuteAndSecond.padStart(5, "0")}` : minuteAndSecond;
}

export function formatTrack(track: Track): string {
  const title = track.uri === null ? track.title : `[${track.title}](${track.uri})`;
  return `${title} — ${track.author} · ${formatDuration(track.durationMs, track.isStream)}`;
}

export function formatQueue(snapshot: QueueSnapshot, maxTracks = 10): string {
  if (snapshot.current === null) {
    return "The queue is empty.";
  }

  const safeLimit = Math.max(1, maxTracks);
  const visibleUpcoming = snapshot.upcoming.slice(0, safeLimit - 1);
  const omitted = snapshot.upcoming.length - visibleUpcoming.length;
  const lines = [
    `**Now playing**\n${formatTrack(snapshot.current)}`,
    ...visibleUpcoming.map((track, index) => `${index + 1}. ${formatTrack(track)}`),
  ];

  if (omitted > 0) {
    lines.push(`…and ${omitted} more`);
  }

  return truncateDiscordMessage(lines.join("\n"));
}

export function truncateDiscordMessage(message: string, maxLength = 1_900): string {
  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
