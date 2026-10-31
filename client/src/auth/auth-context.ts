import { createContext } from 'react';
import type { SignInInput, SignUpInput, UserDto } from '@auth-app/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: UserDto | null;
  status: AuthStatus;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
