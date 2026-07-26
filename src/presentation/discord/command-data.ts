import { InteractionContextType, SlashCommandBuilder } from "discord.js";

export const commandData = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Pesquisa e adiciona música à fila.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Nome, URL da faixa ou playlist")
        .setMaxLength(500)
        .setAutocomplete(true)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("position")
        .setDescription("Onde colocar a música")
        .addChoices(
          { name: "Fim da fila", value: "queue" },
          { name: "Tocar a seguir", value: "next" },
          { name: "Tocar agora", value: "now" },
        ),
    ),
  new SlashCommandBuilder().setName("pause").setDescription("Pausa a música atual."),
  new SlashCommandBuilder().setName("resume").setDescription("Retoma a música atual."),
  new SlashCommandBuilder().setName("skip").setDescription("Salta a música atual."),
  new SlashCommandBuilder().setName("stop").setDescription("Limpa a fila e sai do canal de voz."),
  new SlashCommandBuilder().setName("queue").setDescription("Mostra a fila de reprodução."),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Mostra a música atual."),
  new SlashCommandBuilder().setName("control").setDescription("Abre o painel de reprodução."),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Altera o volume atual.")
    .addIntegerOption((option) =>
      option
        .setName("level")
        .setDescription("Volume entre 0 e 150")
        .setMinValue(0)
        .setMaxValue(150)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Altera o modo de repetição.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Modo de repetição")
        .setRequired(true)
        .addChoices(
          { name: "Desligado", value: "off" },
          { name: "Faixa", value: "track" },
          { name: "Fila", value: "queue" },
        ),
    ),
  new SlashCommandBuilder().setName("shuffle").setDescription("Baralha as próximas músicas."),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove uma música futura.")
    .addIntegerOption((option) =>
      option.setName("position").setDescription("Posição na fila").setMinValue(1).setRequired(true),
    ),
  new SlashCommandBuilder().setName("clear").setDescription("Limpa as próximas músicas."),
  new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Salta para uma posição da música.")
    .addStringOption((option) =>
      option.setName("position").setDescription("Segundos ou mm:ss").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configura o bot neste servidor.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("volume")
        .setDescription("Define o volume inicial.")
        .addIntegerOption((option) =>
          option
            .setName("level")
            .setDescription("Volume entre 0 e 150")
            .setMinValue(0)
            .setMaxValue(150)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("idle-timeout")
        .setDescription("Define o tempo até sair de voz.")
        .addIntegerOption((option) =>
          option
            .setName("seconds")
            .setDescription("Entre 30 e 3600 segundos")
            .setMinValue(30)
            .setMaxValue(3_600)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("announcements")
        .setDescription("Ativa ou desativa anúncios de faixas.")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Publicar anúncios").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("voice-language")
        .setDescription("Escolhe o idioma do reconhecimento de voz.")
        .addStringOption((option) =>
          option
            .setName("language")
            .setDescription("Idioma do modelo de voz")
            .setRequired(true)
            .addChoices({ name: "Português", value: "pt" }, { name: "English", value: "en" }),
        ),
    ),
  new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Gere playlists partilhadas.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Cria uma playlist.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Nome da playlist")
            .setMinLength(1)
            .setMaxLength(40)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("Lista as playlists."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Mostra uma playlist.")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nome").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Adiciona uma faixa.")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nome").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("query").setDescription("Pesquisa ou URL").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove uma faixa.")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nome").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("position").setDescription("Posição").setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("play")
        .setDescription("Reproduz uma playlist.")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nome").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Elimina uma playlist.")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nome").setRequired(true),
        ),
    ),
  new SlashCommandBuilder().setName("help").setDescription("Mostra os comandos disponíveis."),
  new SlashCommandBuilder().setName("ping").setDescription("Verifica a latência do bot."),
  new SlashCommandBuilder()
    .setName("listen")
    .setDescription("Ouve um comando de voz durante alguns segundos (experimental)."),
].map((builder) => builder.setContexts(InteractionContextType.Guild));

export const commandDataByName = new Map(commandData.map((data) => [data.name, data]));
