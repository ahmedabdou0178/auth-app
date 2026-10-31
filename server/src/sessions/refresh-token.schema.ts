import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

/** Long-lived refresh token, issued once per sign-in and never rotated. Only its hash is stored. */
@Schema({ collection: 'refresh_tokens', timestamps: { createdAt: true, updatedAt: false } })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /** SHA-256 (hex) of the raw cookie value. */
  @Prop({ type: String, required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
