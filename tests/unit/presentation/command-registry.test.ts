import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { describe, expect, it, type Mock, vi } from "vitest";

import { GuildAccessPolicy } from "../../../src/application/security/guild-access-policy.js";
import { MusicError } from "../../../src/domain/music/music-error.js";
import type {
  AppLogger,
  DiscordButtonHandler,
  DiscordCommand,
} from "../../../src/presentation/discord/command.js";
import { CommandRegistry } from "../../../src/presentation/discord/command-registry.js";
import { musicErrorMessages } from "../../../src/presentation/discord/user-messages.js";

const ALLOWED_GUILD = "guild-1";

function command(name: string, execute = vi.fn().mockResolvedValue(undefined)): DiscordCommand {
  return { data: { name, toJSON: () => ({}) as never }, execute };
}

function button(
  customId: string,
  execute = vi.fn().mockResolvedValue(undefined),
): DiscordButtonHandler {
  return { customId, execute };
}

function logger(): { error: Mock<AppLogger["error"]> } {
  return { error: vi.fn<AppLogger["error"]>() };
}

function registry(
  commands: readonly DiscordCommand[] = [command("play")],
  buttons: readonly DiscordButtonHandler[] = [button("music:skip")],
  log: AppLogger = logger(),
): CommandRegistry {
  return new CommandRegistry(commands, buttons, log, new GuildAccessPolicy(ALLOWED_GUILD));
}

function chatInput(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    commandName: "play",
    deferred: false,
    editReply: vi.fn().mockResolvedValue(undefined),
    guildId: ALLOWED_GUILD,
    isButton: () => false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    user: { id: "user-1" },
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function buttonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    customId: "music:skip",
    deferred: false,
    editReply: vi.fn().mockResolvedValue(undefined),
    guildId: ALLOWED_GUILD,
    isButton: () => true,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    user: { id: "user-1" },
    ...overrides,
  } as unknown as ButtonInteraction;
}

function autocomplete(overrides: Record<string, unknown> = {}): AutocompleteInteraction {
  return {
    commandName: "play",
    guildId: ALLOWED_GUILD,
    responded: false,
    respond: vi.fn().mockResolvedValue(undefined),
    user: { id: "user-1" },
    ...overrides,
  } as unknown as AutocompleteInteraction;
}

describe("CommandRegistry construction", () => {
  it("rejects duplicate command names", () => {
    expect(() => registry([command("play"), command("play")])).toThrowError(
      /Duplicate Discord command: play/,
    );
  });

  it("rejects duplicate button ids", () => {
    expect(() =>
      registry([command("play")], [button("music:skip"), button("music:skip")]),
    ).toThrowError(/Duplicate Discord button: music:skip/);
  });
});

describe("CommandRegistry guild allowlist", () => {
  it("refuses a command from a guild that is not the private one", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const interaction = chatInput({ guildId: "someone-elses-guild" });

    await registry([command("play", execute)]).execute(interaction);

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: musicErrorMessages.UNAUTHORIZED_GUILD,
      flags: MessageFlags.Ephemeral,
    });
  });

  it("refuses a button from a guild that is not the private one", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const interaction = buttonInteraction({ guildId: "someone-elses-guild" });

    await registry([command("play")], [button("music:skip", execute)]).execute(interaction);

    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses an interaction with no guild at all", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const interaction = chatInput({ guildId: null });

    await registry([command("play", execute)]).execute(interaction);

    expect(execute).not.toHaveBeenCalled();
  });

  it("returns no autocomplete suggestions outside the private guild", async () => {
    const suggest = vi.fn().mockResolvedValue(undefined);
    const target = { ...command("play"), autocomplete: suggest };
    const interaction = autocomplete({ guildId: "someone-elses-guild" });

    await registry([target]).autocomplete(interaction);

    expect(suggest).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

describe("CommandRegistry dispatch", () => {
  it("routes a command to the handler registered under its name", async () => {
    const wanted = vi.fn().mockResolvedValue(undefined);
    const other = vi.fn().mockResolvedValue(undefined);
    const interaction = chatInput({ commandName: "play" });

    await registry([command("play", wanted), command("skip", other)]).execute(interaction);

    expect(wanted).toHaveBeenCalledWith(interaction);
    expect(other).not.toHaveBeenCalled();
  });

  it("routes a button to the handler registered under its custom id", async () => {
    const wanted = vi.fn().mockResolvedValue(undefined);
    const other = vi.fn().mockResolvedValue(undefined);
    const interaction = buttonInteraction({ customId: "music:stop" });

    await registry(
      [command("play")],
      [button("music:skip", other), button("music:stop", wanted)],
    ).execute(interaction);

    expect(wanted).toHaveBeenCalledWith(interaction);
    expect(other).not.toHaveBeenCalled();
  });

  it("answers an unknown control without dispatching", async () => {
    const interaction = chatInput({ commandName: "does-not-exist" });

    await registry().execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Controlo desconhecido.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("passes autocomplete to the matching command", async () => {
    const suggest = vi.fn().mockResolvedValue(undefined);
    const interaction = autocomplete();

    await registry([{ ...command("play"), autocomplete: suggest }]).autocomplete(interaction);

    expect(suggest).toHaveBeenCalledWith(interaction);
  });
});

describe("CommandRegistry while shutting down", () => {
  it("stops dispatching commands and says so", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const subject = registry([command("play", execute)]);
    const interaction = chatInput();

    subject.stopAccepting();
    await subject.execute(interaction);

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "O bot está a reiniciar. Tenta novamente dentro de instantes.",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("stops answering autocomplete with suggestions", async () => {
    const suggest = vi.fn().mockResolvedValue(undefined);
    const subject = registry([{ ...command("play"), autocomplete: suggest }]);
    const interaction = autocomplete();

    subject.stopAccepting();
    await subject.autocomplete(interaction);

    expect(suggest).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

describe("CommandRegistry error handling", () => {
  it("turns a domain error into its user-facing message", async () => {
    const execute = vi.fn().mockRejectedValue(new MusicError("NOTHING_PLAYING", "internal"));
    const interaction = chatInput();

    await registry([command("play", execute)]).execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: musicErrorMessages.NOTHING_PLAYING,
      flags: MessageFlags.Ephemeral,
    });
  });

  it("never surfaces internal detail from an unexpected failure", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5:2333"));
    const interaction = chatInput();

    await registry([command("play", execute)]).execute(interaction);

    const [payload] = (interaction.reply as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { content: string },
    ];
    expect(payload.content).not.toContain("ECONNREFUSED");
    expect(payload.content).not.toContain("10.0.0.5");
  });

  it("logs the failure with the interaction context", async () => {
    const log = logger();
    const execute = vi.fn().mockRejectedValue(new Error("boom"));

    await registry([command("play", execute)], [], log).execute(chatInput());

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: ALLOWED_GUILD, interaction: "play", userId: "user-1" }),
      "Discord interaction failed",
    );
  });

  it("edits the existing response when the interaction was already deferred", async () => {
    const execute = vi.fn().mockRejectedValue(new MusicError("NOTHING_PLAYING", "internal"));
    const interaction = chatInput({ deferred: true });

    await registry([command("play", execute)]).execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: musicErrorMessages.NOTHING_PLAYING,
    });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("returns an empty list when an autocomplete handler fails", async () => {
    const suggest = vi.fn().mockRejectedValue(new Error("resolve failed"));
    const interaction = autocomplete();

    await registry([{ ...command("play"), autocomplete: suggest }]).autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("does not answer twice when autocomplete already responded before failing", async () => {
    const suggest = vi.fn().mockRejectedValue(new Error("late failure"));
    const interaction = autocomplete({ responded: true });

    await registry([{ ...command("play"), autocomplete: suggest }]).autocomplete(interaction);

    expect(interaction.respond).not.toHaveBeenCalled();
  });
});
