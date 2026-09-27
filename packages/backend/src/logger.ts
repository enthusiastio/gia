function prefix(level: string, userId?: string): string {
  return `[${new Date().toISOString()}] [${level}]${userId ? ` [user:${userId}]` : ''}`;
}

export function createLogger(userId?: string) {
  return {
    info: (...args: unknown[]) => console.log(prefix('INFO', userId), ...args),
    warn: (...args: unknown[]) => console.warn(prefix('WARN', userId), ...args),
    error: (...args: unknown[]) => console.error(prefix('ERROR', userId), ...args),
  };
}

export const logger = createLogger();
