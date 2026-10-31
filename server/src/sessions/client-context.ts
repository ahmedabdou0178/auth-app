import type { Request } from 'express';

const MAX_USER_AGENT_LENGTH = 512;

/** Request metadata recorded on a session. `req.ip` honours the `TRUST_PROXY` setting. */
export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

export function clientContext(req: Request): ClientContext {
  const userAgent = req.headers['user-agent'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, MAX_USER_AGENT_LENGTH) } : {}),
  };
}
