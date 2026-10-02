export interface ListenOptions {
  port: number;
  host?: string;
}

const DEFAULT_PORT = 4000;
const MAX_PORT = 65535;

export function resolveListenOptions(env: NodeJS.ProcessEnv): ListenOptions {
  const rawPort = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT inválido: ${rawPort}`);
  }
  return env.HOST ? { port, host: env.HOST } : { port };
}
