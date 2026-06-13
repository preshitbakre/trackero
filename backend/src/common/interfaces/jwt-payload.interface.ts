export interface JwtPayload {
  userId: number;
  email: string;
  role: 'admin' | 'project_manager' | 'member' | 'viewer';
  tokenVersion: number;
  /** Populated on the request user by JwtStrategy from a fresh DB read each
   *  request (not signed into the token). Drives the password-change gate. */
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}
