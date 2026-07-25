import {
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";

import type { GuildAccessPolicy } from "../../application/security/guild-access-policy.js";
import type { AppLogger, DiscordButtonHandler, DiscordCommand } from "./command.js";
import { userFacingMusicError } from "./user-messages.js";

type SupportedInteraction = ButtonInteraction | ChatInputCommandInteraction;

export class CommandRegistry {
  private readonly buttons = new Map<string, DiscordButtonHandler>();
  private readonly commands = new Map<string, DiscordCommand>();
  private accepting = true;

  public constructor(
    commands: readonly DiscordCommand[],
    buttons: readonly DiscordButtonHandler[],
    private readonly logger: AppLogger,
    private readonly accessPolicy: GuildAccessPolicy,
  ) {
    for (const command of commands) {
      if (this.commands.has(command.data.name)) {
        throw new Error(`Duplicate Discord command: ${command.data.name}`);
      }
      this.commands.set(command.data.name, command);
    }
    for (const button of buttons) {
      if (this.buttons.has(button.customId)) {
        throw new Error(`Duplicate Discord button: ${button.customId}`);
      }
      this.buttons.set(button.customId, button);
    }
  }

  public stopAccepting(): void {
    this.accepting = false;
  }

  public async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!this.accepting || !this.accessPolicy.isAllowed(interaction.guildId)) {
      await interaction.respond([]);
      return;
    }
    const handler = this.commands.get(interaction.commandName);
    try {
      await handler?.autocomplete?.(interaction);
    } catch (error) {
      this.logger.error(
        { error, guildId: interaction.guildId, interaction: interaction.commandName },
        "Discord autocomplete failed",
      );
      if (!interaction.responded) {
        await interaction.respond([]);
      }
    }
  }

  public async execute(interaction: SupportedInteraction): Promise<void> {
    try {
      if (!this.accepting) {
        await interaction.reply({
          content: "O bot está a reiniciar. Tenta novamente dentro de instantes.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      this.accessPolicy.assertAllowed(interaction.guildId);
      const handler = interaction.isButton()
        ? this.buttons.get(interaction.customId)
        : this.commands.get(interaction.commandName);
      if (handler === undefined) {
        await interaction.reply({
          content: "Controlo desconhecido.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await handler.execute(interaction as never);
    } catch (error) {
      this.logger.error(
        {
          error,
          guildId: interaction.guildId,
          interaction: interaction.isButton() ? interaction.customId : interaction.commandName,
          userId: interaction.user.id,
        },
        "Discord interaction failed",
      );
      await this.replyWithError(interaction, error);
    }
  }

  private async replyWithError(interaction: SupportedInteraction, error: unknown): Promise<void> {
    const content = userFacingMusicError(error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
      return;
    }
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
