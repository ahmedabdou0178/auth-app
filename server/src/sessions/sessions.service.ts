import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AppConfig } from '../config/app-config.js';
import type { ClientContext } from './client-context.js';
import { RefreshToken } from './refresh-token.schema.js';
import { Session, type SessionDocument } from './session.schema.js';
import { randomToken, sha256Hex } from './tokens.js';

/** `lastActivityAt` / `lastSeenIp` are written at most this often per session. */
export const ACTIVITY_WRITE_INTERVAL_MS = 60_000;

const DAY_MS = 86_400_000;

export interface StartedSession {
  session: SessionDocument;
  /** Raw refresh token for the cookie; only its hash is stored. */
  refreshToken: string;
}

@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(RefreshToken.name) private readonly refreshTokens: Model<RefreshToken>,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([this.sessions.init(), this.refreshTokens.init()]);
  }

  /** Sign-up / sign-in: a new refresh token plus its first session. */
  async start(userId: Types.ObjectId, context: ClientContext): Promise<StartedSession> {
    const refreshToken = randomToken();
    const stored = await this.refreshTokens.create({
      userId,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * DAY_MS),
    });
    const session = await this.createSession(userId, stored._id, context);
    return { session, refreshToken };
  }

  /**
   * Issues a new session (new sid + CSRF token) from a live refresh token, which stays unchanged.
   * The presented session, if it belongs to that token, is deleted so it can't be reused.
   * Returns null when the token is unknown, revoked or expired.
   */
  async refresh(
    refreshToken: string,
    presentedSessionId: string | undefined,
    context: ClientContext,
  ): Promise<SessionDocument | null> {
    const token = await this.refreshTokens
      .findOne({
        tokenHash: sha256Hex(refreshToken),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!token) return null;
    if (presentedSessionId) {
      await this.sessions
        .deleteOne({ sessionId: presentedSessionId, refreshTokenId: token._id })
        .exec();
    }
    return this.createSession(token.userId, token._id, context);
  }

  /**
   * Logout: revokes the refresh token(s) identified by the cookies and deletes every session
   * they created. Unknown or missing values are ignored (logout is idempotent).
   */
  async end(cookies: { refreshToken?: string; sessionId?: string }): Promise<void> {
    const [token, session] = await Promise.all([
      cookies.refreshToken
        ? this.refreshTokens
            .findOne({ tokenHash: sha256Hex(cookies.refreshToken) }, { _id: 1 })
            .exec()
        : null,
      cookies.sessionId
        ? this.sessions.findOne({ sessionId: cookies.sessionId }, { refreshTokenId: 1 }).exec()
        : null,
    ]);
    const ids = [token?._id, session?.refreshTokenId].filter(
      (id): id is Types.ObjectId => id !== undefined,
    );
    if (ids.length === 0) return;
    await Promise.all([
      this.refreshTokens
        .updateMany({ _id: { $in: ids }, revokedAt: null }, { $set: { revokedAt: new Date() } })
        .exec(),
      this.sessions.deleteMany({ refreshTokenId: { $in: ids } }).exec(),
    ]);
  }

  /** A session that exists and has not expired (the TTL monitor can lag up to a minute). */
  findActive(sessionId: string): Promise<SessionDocument | null> {
    return this.sessions.findOne({ sessionId, expiresAt: { $gt: new Date() } }).exec();
  }

  /** Throttled activity tracking: skip the write when the last one is under a minute old. */
  async recordActivity(session: SessionDocument, ip: string | undefined): Promise<void> {
    const now = new Date();
    if (now.getTime() - session.lastActivityAt.getTime() < ACTIVITY_WRITE_INTERVAL_MS) return;
    // Conditional on the value we read, so concurrent requests don't stack writes.
    await this.sessions
      .updateOne(
        { _id: session._id, lastActivityAt: session.lastActivityAt },
        { $set: { lastActivityAt: now, ...(ip ? { lastSeenIp: ip } : {}) } },
      )
      .exec();
  }

  private createSession(
    userId: Types.ObjectId,
    refreshTokenId: Types.ObjectId,
    context: ClientContext,
  ): Promise<SessionDocument> {
    const now = Date.now();
    return this.sessions.create({
      sessionId: randomToken(),
      csrfToken: randomToken(),
      userId,
      refreshTokenId,
      lastActivityAt: new Date(now),
      expiresAt: new Date(now + this.config.get('SESSION_TTL') * 1000),
      initialIp: context.ip,
      lastSeenIp: context.ip,
      userAgent: context.userAgent,
    });
  }
}
