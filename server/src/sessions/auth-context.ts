import type { SessionDocument } from './session.schema.js';
import type { UserDocument } from '../users/user.schema.js';

/** Set on the request by `SessionGuard` when a valid `sid` cookie is presented. */
export interface AuthContext {
  user: UserDocument;
  session: SessionDocument;
}

// express' Request extends http.IncomingMessage (same pattern pino-http uses for `req.id`).
declare module 'http' {
  interface IncomingMessage {
    auth?: AuthContext;
  }
}
