export type UserRole = "super_admin" | "admin" | "program_admin" | "viewer";
export type UserStatus = "active" | "suspended";
export type ProgramRole = "admin" | "viewer";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  // Null only for the platform super_admin; every other role always has one.
  tenantId: string | null;
  emailVerified: boolean;
}
