import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type Model, Types } from 'mongoose';
import { AppConfig } from '../config/app-config';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { Session, SessionSchema } from './session.schema';
import { ACTIVITY_WRITE_INTERVAL_MS, SessionsService } from './sessions.service';
import { sha256Hex } from './tokens';

const CONFIG: Record<string, number> = { SESSION_TTL: 900, REFRESH_TOKEN_TTL_DAYS: 7 };

let mongo: MongoMemoryServer;
let moduleRef: TestingModule;
let service: SessionsService;
let sessions: Model<Session>;
let refreshTokens: Model<RefreshToken>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  moduleRef = await Test.createTestingModule({
    imports: [
      MongooseModule.forRoot(mongo.getUri('sessions')),
      MongooseModule.forFeature([
        { name: Session.name, schema: SessionSchema },
        { name: RefreshToken.name, schema: RefreshTokenSchema },
      ]),
    ],
    providers: [
      SessionsService,
      { provide: AppConfig, useValue: { get: (key: string) => CONFIG[key] } },
    ],
  }).compile();
  await moduleRef.init();
  service = moduleRef.get(SessionsService);
  sessions = moduleRef.get(getModelToken(Session.name));
  refreshTokens = moduleRef.get(getModelToken(RefreshToken.name));
});

afterAll(async () => {
  await moduleRef.close();
  await mongo.stop();
});

const CONTEXT = { ip: '10.0.0.1', userAgent: 'jest' };

describe('SessionsService.start', () => {
  it('creates a hashed refresh token and a 15-minute session with random tokens', async () => {
    const userId = new Types.ObjectId();
    const before = Date.now();
    const { session, refreshToken } = await service.start(userId, CONTEXT);

    expect(session.sessionId).toMatch(/^[\w-]{43}$/);
    expect(session.csrfToken).toMatch(/^[\w-]{43}$/);
    expect(session.csrfToken).not.toBe(session.sessionId);
    expect(session.expiresAt.getTime() - before).toBeGreaterThanOrEqual(900_000);
    expect(session.expiresAt.getTime() - before).toBeLessThan(905_000);
    expect(session).toMatchObject({
      initialIp: '10.0.0.1',
      lastSeenIp: '10.0.0.1',
      userAgent: 'jest',
    });

    const stored = await refreshTokens.findById(session.refreshTokenId).lean();
    expect(stored?.tokenHash).toBe(sha256Hex(refreshToken));
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
    expect(stored?.revokedAt).toBeNull();
  });
});

describe('SessionsService.findActive', () => {
  it('ignores expired sessions even before the TTL monitor removes them', async () => {
    const { session } = await service.start(new Types.ObjectId(), CONTEXT);
    expect(await service.findActive(session.sessionId)).not.toBeNull();
    await sessions.updateOne({ _id: session._id }, { expiresAt: new Date(Date.now() - 1) });
    expect(await service.findActive(session.sessionId)).toBeNull();
  });
});

describe('SessionsService.refresh', () => {
  it('replaces the presented session and keeps the refresh token unchanged', async () => {
    const { session, refreshToken } = await service.start(new Types.ObjectId(), CONTEXT);
    const next = await service.refresh(refreshToken, session.sessionId, CONTEXT);

    expect(next?.sessionId).not.toBe(session.sessionId);
    expect(next?.csrfToken).not.toBe(session.csrfToken);
    expect(next?.refreshTokenId.equals(session.refreshTokenId)).toBe(true);
    expect(await sessions.exists({ sessionId: session.sessionId })).toBeNull();
    // Not rotated: the same token can refresh again.
    expect(await service.refresh(refreshToken, undefined, CONTEXT)).not.toBeNull();
  });

  it('does not delete a session that belongs to another refresh token', async () => {
    const victim = await service.start(new Types.ObjectId(), CONTEXT);
    const attacker = await service.start(new Types.ObjectId(), CONTEXT);
    await service.refresh(attacker.refreshToken, victim.session.sessionId, CONTEXT);
    expect(await service.findActive(victim.session.sessionId)).not.toBeNull();
  });

  it('returns null for unknown, revoked or expired tokens', async () => {
    expect(await service.refresh('unknown', undefined, CONTEXT)).toBeNull();

    const revoked = await service.start(new Types.ObjectId(), CONTEXT);
    await refreshTokens.updateOne(
      { _id: revoked.session.refreshTokenId },
      { revokedAt: new Date() },
    );
    expect(await service.refresh(revoked.refreshToken, undefined, CONTEXT)).toBeNull();

    const expired = await service.start(new Types.ObjectId(), CONTEXT);
    await refreshTokens.updateOne(
      { _id: expired.session.refreshTokenId },
      { expiresAt: new Date(Date.now() - 1) },
    );
    expect(await service.refresh(expired.refreshToken, undefined, CONTEXT)).toBeNull();
  });
});

describe('SessionsService.end', () => {
  it('revokes the refresh token and deletes every session it created', async () => {
    const { session, refreshToken } = await service.start(new Types.ObjectId(), CONTEXT);
    const second = await service.refresh(refreshToken, undefined, CONTEXT);

    await service.end({ refreshToken });

    expect(await sessions.countDocuments({ refreshTokenId: session.refreshTokenId })).toBe(0);
    expect(second && (await service.findActive(second.sessionId))).toBeNull();
    const stored = await refreshTokens.findById(session.refreshTokenId).lean();
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });

  it('finds the refresh token through the session when only the sid is sent', async () => {
    const { session, refreshToken } = await service.start(new Types.ObjectId(), CONTEXT);
    await service.end({ sessionId: session.sessionId });
    expect(await service.refresh(refreshToken, undefined, CONTEXT)).toBeNull();
  });

  it('ignores unknown or missing values', async () => {
    await expect(service.end({})).resolves.toBeUndefined();
    await expect(service.end({ refreshToken: 'nope', sessionId: 'nope' })).resolves.toBeUndefined();
  });
});

describe('SessionsService.recordActivity', () => {
  it('writes at most once per interval', async () => {
    const { session } = await service.start(new Types.ObjectId(), CONTEXT);
    await service.recordActivity(session, '10.0.0.2');
    expect((await sessions.findById(session._id).lean())?.lastSeenIp).toBe('10.0.0.1');

    const old = new Date(Date.now() - ACTIVITY_WRITE_INTERVAL_MS - 1);
    await sessions.updateOne({ _id: session._id }, { lastActivityAt: old });
    const stale = await sessions.findById(session._id).orFail();
    await service.recordActivity(stale, '10.0.0.2');

    const updated = await sessions.findById(session._id).lean();
    expect(updated?.lastSeenIp).toBe('10.0.0.2');
    expect(updated?.lastActivityAt.getTime()).toBeGreaterThan(old.getTime());
  });
});
