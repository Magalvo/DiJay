import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export interface AppLogger {
  error(context: unknown, message?: string): void;
}

export interface DiscordCommandData {
  readonly name: string;
  toJSON(): ReturnType<SlashCommandBuilder["toJSON"]>;
}

export interface DiscordCommand {
  readonly data: DiscordCommandData;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface DiscordButtonHandler {
  readonly customId: string;
  execute(interaction: ButtonInteraction): Promise<void>;
}
