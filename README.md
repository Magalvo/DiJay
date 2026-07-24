# DiJay

<p align="center">
  <img width="100%" height="100%" src="https://github.com/Magalvo/DiJay/blob/main/docs/DiJayBG.png">
</p>

Bot privado de música para Discord, construído com TypeScript estrito, SDD/TDD,
Discord.js, Lavalink v4 e SQLite integrado no Node.js.

## Funcionalidades

- Pesquisa e reprodução por nome ou URL
- Fila, pause, resume, skip, stop, volume, loop, seek, shuffle, remove e clear
- Posicionamento no fim, a seguir ou imediatamente
- Painel público com botões e estado de reprodução
- Playlists partilhadas e definições persistentes em SQLite
- Allowlist obrigatória de um único servidor Discord
- Timeout de voz, logs estruturados, healthcheck e shutdown gracioso

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

## Arquitetura

```text
presentation -> application -> domain
                         ^
                         |
                 infrastructure
```

Discord, Poru/Lavalink, HTTP e SQLite são adaptadores. Os casos de uso e os repositórios
da aplicação não dependem desses SDKs. Especificações e critérios encontram-se em
`docs/work-items` e `docs/work-specs`.

Respeita os termos e direitos aplicáveis às fontes de áudio e reproduz apenas conteúdo
que estejas autorizado a transmitir.
