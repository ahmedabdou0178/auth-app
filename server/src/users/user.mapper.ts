import type { UserDto } from '@auth-app/shared';
import type { UserDocument } from './user.schema.js';

/** The only way a user leaves the API: an explicit whitelist, never the document. */
export function toUserDto(user: UserDocument): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}
