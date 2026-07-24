import { describe, expect, it } from "vitest";

import { GuildAccessPolicy } from "../../../src/application/security/guild-access-policy.js";

describe("GuildAccessPolicy", () => {
  const policy = new GuildAccessPolicy("guild-allowed");

  it("accepts the configured private guild", () => {
    expect(policy.isAllowed("guild-allowed")).toBe(true);
    expect(() => policy.assertAllowed("guild-allowed")).not.toThrow();
  });

  it("rejects DMs and other guilds with a stable error", () => {
    expect(() => policy.assertAllowed(null)).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED_GUILD" }),
    );
    expect(() => policy.assertAllowed("guild-other")).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED_GUILD" }),
    );
  });
});
