import { Config } from "effect";

export const ServerPort = Config.Number("PORT").pipe(Config.withDefault(9000));

export const ServerConfig = Config.all({
  port: ServerPort,
  hostname: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.Number("IDLE_TIMEOUT").pipe(Config.withDefault(120)),
  allowedOrigins: Config.String("ALLOWED_ORIGINS").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
});
