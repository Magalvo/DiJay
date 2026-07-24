import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";

import type { GuildAccessPolicy } from "../../application/security/guild-access-policy.js";
import { MusicError } from "../../domain/music/music-error.js";
import type { AppLogger, DiscordButtonHandler, DiscordCommand } from "./command.js";

const userMessages: Record<MusicError["code"], string> = {
  INVALID_IDLE_TIMEOUT: "O timeout deve estar entre 30 e 3600 segundos.",
  INVALID_PLAYLIST_NAME: "O nome da playlist deve ter entre 1 e 40 caracteres.",
  INVALID_QUERY: "Indica uma pesquisa ou URL válida.",
  INVALID_QUEUE_POSITION: "Essa posição não existe.",
  INVALID_SEEK: "Essa posição não pertence à faixa atual.",
  INVALID_VOLUME: "O volume deve estar entre 0 e 150.",
  LIVE_STREAM_NOT_SEEKABLE: "Não é possível procurar uma posição numa emissão em direto.",
  NOTHING_PLAYING: "Não há música em reprodução neste servidor.",
  NOT_IN_SAME_VOICE_CHANNEL: "Entra no mesmo canal de voz do bot para usar este controlo.",
  PLAYLIST_EXISTS: "Já existe uma playlist com esse nome.",
  PLAYLIST_FULL: "A playlist já atingiu o limite de 100 faixas.",
  PLAYLIST_NOT_FOUND: "Não encontrei essa playlist.",
  QUEUE_EMPTY: "Não existem músicas suficientes na fila.",
  TRACK_NOT_FOUND: "Não encontrei nenhuma faixa para essa pesquisa.",
  UNAUTHORIZED_GUILD: "Este bot é privado e não está autorizado neste servidor.",
  VOICE_CHANNEL_REQUIRED: "Entra primeiro num canal de voz.",
};

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

  public async execute(interaction: SupportedInteraction): Promise<void> {
    try {
      if (!this.accepting) {
        await interaction.reply({
          content: "O bot está a reiniciar. Tenta novamente dentro de instantes.",
          ephemeral: true,
        });
        return;
      }
      this.accessPolicy.assertAllowed(interaction.guildId);
      const handler = interaction.isButton()
        ? this.buttons.get(interaction.customId)
        : this.commands.get(interaction.commandName);
      if (handler === undefined) {
        await interaction.reply({ content: "Controlo desconhecido.", ephemeral: true });
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
    const content =
      error instanceof MusicError
        ? userMessages[error.code]
        : "Ocorreu um erro inesperado. Tenta novamente dentro de instantes.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
      return;
    }
    await interaction.reply({ content, ephemeral: true });
  }
}
