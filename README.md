# DiJay

<p align="center">
  <img width="100%" height="100%" src="https://github.com/Magalvo/DiJay/blob/main/docs/DiJayBG.png">
</p>

Bot privado de música para Discord, construído com TypeScript estrito, SDD/TDD,
Discord.js, Lavalink v4 e SQLite integrado no Node.js.

## Funcionalidades

- Pesquisa e reprodução por nome ou URL, com autocomplete no `/play`
- Links de Spotify (metadados via LavaSrc, áudio espelhado pelo YouTube)
- Fila, pause, resume, skip, stop, volume, loop, seek, shuffle, remove e clear
- Posicionamento no fim, a seguir ou imediatamente
- Painel público com botões, capa e estado de reprodução, atualizado sozinho
- Playlists partilhadas e definições persistentes em SQLite
- Comandos de voz opcionais (Vosk offline) — ver [Reconhecimento de voz](#reconhecimento-de-voz)
- Allowlist obrigatória de um único servidor Discord
- Timeout de voz, logs estruturados, healthcheck, watchdog e shutdown gracioso

## Desenvolvimento local

Requisitos: Node.js 24.15+, npm 11 e Docker Compose.

1. Copia `.env.example` para `.env` e preenche os valores reais.
   `BOT_STATUS_TEXT` controla a atividade apresentada no perfil do bot.
2. Arranca apenas o Lavalink, expondo-o localmente:

```bash
docker compose -f compose.yml -f compose.dev.yml up -d lavalink
npm install
npm run register:commands
npm run dev
```

Comandos de qualidade:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## VPS

O deployment de produção executa o bot e Lavalink numa rede Docker interna, sem publicar
as respetivas portas:

```bash
docker compose up -d --build
docker compose ps
```

A base de dados fica no volume `dijay-data`. Para criar um backup consistente:

```bash
docker compose exec bot npm run db:backup
```

As instruções completas de instalação, atualização, rollback e restauro estão em
[`docs/canonical/operations.md`](docs/canonical/operations.md).

## Reconhecimento de voz

Opcional e desligado por defeito. Usa o motor open-source **Vosk** (offline, sem enviar
áudio para lado nenhum) e a captura `@discordjs/voice`.

O reconhecimento corre num **processo separado — o sidecar `voice-listener`** — com uma
**segunda identidade Discord ("DiJayMic")**. O motivo é estrutural: o Discord dá uma
ligação de voz por bot e por servidor, e essa pertence ao Lavalink para _enviar_ áudio.
Uma segunda identidade tem a sua própria ligação, por isso pode _receber_ áudio em
permanência sem interromper a reprodução.

O que suporta:

- **Mãos-livres por wake word** — diz `dj <comando>` no canal, sem escrever nada:
  "dj pausa", "dj salta", "dj volume 40", "dj toca daft punk".
- **`/listen`** — captura pontual (push-to-talk) a partir do bot principal, sem sidecar.
- **Sons por palavra-gatilho** — certas palavras disparam um som (soundboard ou clipe
  local), sem prefixo `dj`.
- **Saudações** ao entrar em canal ou ao entrar um membro no servidor.
- **PT/EN em runtime** via `/settings voice-language`, sem reiniciar.

Toggles independentes, por servidor, todos em `/settings`:
`voice-commands`, `voice-sounds`, `voice-language` e `voice-join-greeting`.

### Privacidade

Lê isto antes de ligares a escuta mãos-livres — passa a haver transcrição contínua no
canal de voz:

- O áudio é processado **em memória e nunca escrito em disco**, e a transcrição é
  **local** (Vosk offline). Nada é enviado para serviços externos.
- Em `LOG_LEVEL=info` (o valor por omissão) **o conteúdo do que é dito nunca é
  registado** — os logs guardam apenas se um comando correu, não o que foi falado.
  A transcrição só aparece em `LOG_LEVEL=debug`, uma escolha explícita do operador para
  diagnosticar reconhecimento; não a deixes ligada em produção.
- Tudo é **opt-in**: `VOICE_ENABLED` está a `false`, o sidecar exige o seu próprio
  deployment, e cada funcionalidade tem um toggle por servidor.
- A escuta mãos-livres implica que o sidecar transcreve as falas no canal para detetar o
  wake word. **Avisa os membros do servidor** antes de a ativares.

### Experimentar em desenvolvimento

1. Instala as dependências opcionais (nativas, fora da imagem Alpine de produção):

```bash
npm install --include=optional
```

2. Descarrega um [modelo Vosk](https://alphacephei.com/vosk/models) para o caminho de
   `VOICE_STT_MODEL_PATH` (ex.: `./models/vosk-model-small-pt-0.3`).
3. No `.env`, define `VOICE_ENABLED=true` e arranca com `npm run dev`.
4. Num canal de voz, usa `/listen` e diz "salta", "pausa" ou "volume 40".

O `/listen` no bot principal assume a ligação de voz numa janela curta (é o Lavalink que
a detém durante a reprodução); a escuta mãos-livres do sidecar não tem esse efeito. O
deployment do sidecar e do modelo está em
[`docs/canonical/operations.md`](docs/canonical/operations.md). A infraestrutura de voz é
verificada por `npm run typecheck:voice`.

## Arquitetura

Dentro de cada processo, as dependências apontam para dentro:

```text
presentation -> application -> domain
                         ^
                         |
                 infrastructure
```

Discord, Poru/Lavalink, HTTP e SQLite são adaptadores. Os casos de uso e os repositórios
da aplicação não dependem desses SDKs.

Em produção correm processos separados, numa rede Docker privada e sem portas publicadas:

```text
  bot (DiJay)  ──────────────►  lavalink  ──►  yt-cipher
   │  ▲                                        spotify-tokener
   │  │ IPC HTTP (segredo partilhado)
   │  │
   │  └──────────  voice-listener (DiJayMic)
   └─ SQLite
```

O `voice-listener` é uma identidade Discord distinta que só ouve; reencaminha os comandos
reconhecidos para o bot principal por um endpoint HTTP interno autenticado com segredo
partilhado, e é o bot principal que valida a allowlist e o canal de voz. Os sidecars
`yt-cipher` e `spotify-tokener` servem o Lavalink — ver
[`docs/canonical/operations.md`](docs/canonical/operations.md).

Especificações e critérios encontram-se em `docs/work-items` e `docs/work-specs`.

Respeita os termos e direitos aplicáveis às fontes de áudio e reproduz apenas conteúdo
que estejas autorizado a transmitir.
