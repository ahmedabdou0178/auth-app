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
