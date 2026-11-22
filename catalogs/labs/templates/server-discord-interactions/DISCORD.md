# Verify a Discord interaction

To check the endpoint locally, send a signed Discord PING to `POST /webhooks/discord` using a fixture key pair. A valid PING gets `{"type":1}`. A tampered signature or timestamp gets HTTP 401. An authenticated malformed or unsupported interaction gets HTTP 400.

To start the server with this module, set `DISCORD_PUBLIC_KEY` to the Discord application's hex public key and run `{{runCommand}} dev`. The handler builds the signed message from the timestamp header followed by the original body bytes. It checks the signature before decoding the interaction. The original health route remains at `GET /`.

The route handles Discord's HTTP endpoint check. Add command dispatch after authentication when you are ready to handle commands. A Gateway connection would need a runtime that owns heartbeats and reconnects.

See [Discord's interaction endpoint documentation](https://docs.discord.com/developers/interactions/receiving-and-responding).
