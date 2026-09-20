import "dotenv/config";

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

/**
 * One-off helper that obtains the Spotify refresh token `/playlist import` needs.
 *
 * A user token is unavoidable here. Playlist contents are only readable as the account that
 * owns the playlist: with client credentials alone Spotify answers 200 for the playlist and
 * omits its items entirely. So this runs the Authorization Code flow once, on a loopback
 * server, and prints the refresh token to paste into SPOTIFY_REFRESH_TOKEN.
 *
 * Run with: npm run spotify:authorize
 */
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
// Read-only. Nothing here can modify, create or delete anything in the linked account.
const SCOPES = "playlist-read-private playlist-read-collaborative";
const TIMEOUT_MS = 600_000;

const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "";
if (clientId === "" || clientSecret === "") {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authorizeUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    show_dialog: "true",
    state,
  }).toString();

const finish = (code: number): never => process.exit(code);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:8888");
  if (url.pathname !== "/callback") {
    response.writeHead(404).end();
    return;
  }
  const failure = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(
    failure === null
      ? "<h2>Autorizado. Podes fechar esta janela.</h2>"
      : `<h2>Autorizacao recusada: ${failure}</h2>`,
  );

  void (async () => {
    if (failure !== null) {
      console.error(`Authorisation refused: ${failure}`);
      finish(1);
    }
    // Guards against a callback that did not originate from the URL printed above.
    if (url.searchParams.get("state") !== state) {
      console.error("State mismatch: ignoring this callback.");
      finish(1);
    }
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      body: new URLSearchParams({
        code: code ?? "",
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const body = (await tokenResponse.json()) as { refresh_token?: string };
    if (body.refresh_token === undefined) {
      console.error(`Token exchange failed with ${tokenResponse.status}.`);
      finish(1);
    }
    console.log(`\nSPOTIFY_REFRESH_TOKEN=${body.refresh_token}\n`);
    console.log("Paste that line into .env (it is gitignored) and restart the bot.");
    finish(0);
  })();
});

server.listen(8888, "127.0.0.1", () => {
  console.log("Add this exact Redirect URI to the app at developer.spotify.com/dashboard:");
  console.log(`  ${REDIRECT_URI}`);
  console.log("\nThen open this URL and authorise with the account that owns the playlists:\n");
  console.log(authorizeUrl);
  console.log("\nWaiting for the callback...");
});

setTimeout(() => {
  console.error("Timed out waiting for authorisation.");
  finish(1);
}, TIMEOUT_MS).unref();
