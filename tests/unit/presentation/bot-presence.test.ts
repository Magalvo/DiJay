import { ActivityType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { configureBotPresence } from "../../../src/presentation/discord/bot-presence.js";

describe("configureBotPresence", () => {
  it("publishes the configured text as a listening activity", () => {
    const setActivity = vi.fn();

    configureBotPresence({ setActivity }, "música | /play");

    expect(setActivity).toHaveBeenCalledWith("música | /play", {
      type: ActivityType.Listening,
    });
  });
});
