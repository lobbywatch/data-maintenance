import * as winston from "winston";

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  level: "debug",
});

export function createLogger(module: string): winston.Logger {
  return logger.child({ module });
}
