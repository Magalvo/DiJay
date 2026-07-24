import { ActivityType } from "discord.js";

interface PresenceUser {
  setActivity(name: string, options: { type: ActivityType }): unknown;
}

export function configureBotPresence(user: PresenceUser, statusText: string): void {
  user.setActivity(statusText, {
    type: ActivityType.Listening,
  });
}
