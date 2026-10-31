import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

/** One signed-in browser session, identified by the raw `sid` cookie value. */
@Schema({ collection: 'sessions', timestamps: { createdAt: true, updatedAt: false } })
export class Session {
  /** Raw cookie value (author's decision; see tradeoffs.md B7). */
  @Prop({ type: String, required: true, unique: true })
  sessionId!: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /** The refresh token that created this session; logout ends every session it created. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  refreshTokenId!: Types.ObjectId;

  /** Synchronizer CSRF token, compared with the `X-CSRF-Token` header. */
  @Prop({ type: String, required: true })
  csrfToken!: string;

  @Prop({ type: Date, required: true })
  lastActivityAt!: Date;

  /** Fixed lifetime; the TTL index removes the document, queries also check it. */
  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: String })
  initialIp?: string;

  @Prop({ type: String })
  lastSeenIp?: string;

  @Prop({ type: String })
  userAgent?: string;

  createdAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
