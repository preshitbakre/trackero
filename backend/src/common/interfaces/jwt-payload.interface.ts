export interface JwtPayload {
  userId: number;
  email: string;
  role: 'admin' | 'project_manager' | 'member' | 'viewer';
  tokenVersion: number;
  iat?: number;
  exp?: number;
}
