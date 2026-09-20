import { MusicError } from "../../domain/music/music-error.js";
import { MAX_PLAYLIST_TRACKS } from "../../domain/playlists/playlist.js";

/** Portuguese, user-facing text for each domain error code. */
export const musicErrorMessages: Record<MusicError["code"], string> = {
  INVALID_IDLE_TIMEOUT: "O timeout deve estar entre 30 e 3600 segundos.",
  INVALID_PLAYLIST_NAME: "O nome da playlist deve ter entre 1 e 40 caracteres.",
  INVALID_QUERY: "Indica uma pesquisa ou URL válida.",
  INVALID_QUEUE_POSITION: "Essa posição não existe.",
  INVALID_SPOTIFY_REFERENCE:
    "Indica o link de uma playlist do Spotify (open.spotify.com/playlist/...).",
  INVALID_SEEK: "Essa posição não pertence à faixa atual.",
  INVALID_VOICE_LANGUAGE: "O idioma de voz deve ser 'pt' ou 'en'.",
  INVALID_VOLUME: "O volume deve estar entre 0 e 150.",
  LIVE_STREAM_NOT_SEEKABLE: "Não é possível procurar uma posição numa emissão em direto.",
  NOTHING_PLAYING: "Não há música em reprodução neste servidor.",
  NOT_IN_SAME_VOICE_CHANNEL: "Entra no mesmo canal de voz do bot para usar este controlo.",
  PLAYLIST_EXISTS: "Já existe uma playlist com esse nome.",
  PLAYLIST_FULL: `A playlist já atingiu o limite de ${MAX_PLAYLIST_TRACKS} faixas.`,
  PLAYLIST_NOT_FOUND: "Não encontrei essa playlist.",
  QUEUE_EMPTY: "Não existem músicas suficientes na fila.",
  SPOTIFY_NOT_AUTHORISED:
    "A ligação ao Spotify expirou ou foi revogada. É preciso autorizar a conta outra vez.",
  SPOTIFY_NOT_CONFIGURED: "A importação do Spotify não está configurada neste servidor.",
  SPOTIFY_PLAYLIST_UNAVAILABLE:
    "O Spotify não dá acesso a essa playlist. Só funcionam as playlists da conta ligada — as de outras pessoas e as geradas pelo Spotify (Discover Weekly, Daily Mix) estão fora de alcance.",
  SPOTIFY_UNAVAILABLE: "O Spotify não respondeu. Tenta novamente dentro de instantes.",
  TRACK_NOT_FOUND: "Não encontrei nenhuma faixa para essa pesquisa.",
  UNAUTHORIZED_GUILD: "Este bot é privado e não está autorizado neste servidor.",
  VOICE_CHANNEL_REQUIRED: "Entra primeiro num canal de voz.",
};

const GENERIC_MESSAGE = "Ocorreu um erro inesperado. Tenta novamente dentro de instantes.";

/**
 * Maps any thrown value to safe, user-facing text. Known domain errors get their Portuguese
 * message; anything else falls back to a generic notice so internal details (native library
 * failures, stack traces) are never surfaced to Discord.
 */
export function userFacingMusicError(error: unknown): string {
  return error instanceof MusicError ? musicErrorMessages[error.code] : GENERIC_MESSAGE;
}
