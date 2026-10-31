import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  /** Never selected unless asked for explicitly (`+passwordHash`). */
  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Whitelist: `_id`, `__v`, `passwordHash` and any future field never leak through toJSON.
UserSchema.set('toJSON', {
  transform: (doc: UserDocument) => ({
    id: doc.id,
    email: doc.email,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }),
});
