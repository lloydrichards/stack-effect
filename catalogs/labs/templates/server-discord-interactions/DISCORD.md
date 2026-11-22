# Verify a Discord interaction

Run `{{runCommand}} fixture:discord` from this server directory. The fixture creates a temporary signing key and calls the generated adapter in process. A signed PING returns HTTP 200 with `{"type":1}`. A tampered request returns 401, malformed or unsupported payloads return 400, and an oversized delivery returns 413.

To start the server with this module, set `DISCORD_PUBLIC_KEY` to the Discord application's hex public key and run `{{runCommand}} dev`. The handler builds the signed message from the timestamp header followed by the original body bytes. It checks the signature before decoding the interaction. The original health route remains at `GET /`.

The route handles Discord's HTTP endpoint check. Add command dispatch after authentication when you are ready to handle commands. A Gateway connection would need a runtime that owns heartbeats and reconnects.

See [Discord's interaction endpoint documentation](https://docs.discord.com/developers/interactions/receiving-and-responding).
