// Which backups retention may delete. Pure rules, so they can be tested without a database.

export interface RetentionCandidate {
  id: string;
  type: "automatic" | "manual" | "pre_restore";
  status: "running" | "completed" | "failed" | "deleted";
  verificationStatus: "pending" | "valid" | "invalid";
  startedAt: Date;
}

export interface RetentionPolicy {
  /** Backups older than this many days may be deleted... */
  retentionDays: number;
  /** ...but the newest this-many valid backups are always kept. */
  keepLatest: number;
}

export const RETENTION_LIMITS = { retentionDays: { min: 1, max: 3650 }, keepLatest: { min: 3, max: 365 } } as const;

const isRecoveryPoint = (b: RetentionCandidate) => b.status === "completed" && b.verificationStatus === "valid";

/**
 * Returns the ids that may be deleted. Never returns: the newest valid backup, the newest `keepLatest` valid backups,
 * anything younger than the retention period, anything in `protectedIds` (used by a restore in progress), or a backup
 * that is still running. If there is only one valid backup it is always kept. Failed or invalid backups past the
 * retention period are removed (their files, if any, are useless).
 */
export function selectBackupsToDelete(all: RetentionCandidate[], policy: RetentionPolicy, protectedIds: ReadonlySet<string>, now: Date): string[] {
  const keepLatest = Math.max(1, policy.keepLatest);
  const cutoff = now.getTime() - policy.retentionDays * 86_400_000;
  const valid = all.filter(isRecoveryPoint).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const keep = new Set<string>(valid.slice(0, keepLatest).map((b) => b.id));
  return all
    .filter((b) => b.status !== "deleted" && b.status !== "running")
    .filter((b) => !keep.has(b.id) && !protectedIds.has(b.id))
    .filter((b) => b.startedAt.getTime() < cutoff)
    .map((b) => b.id);
}

export function clampPolicy(input: Partial<RetentionPolicy>, fallback: RetentionPolicy): RetentionPolicy {
  const clamp = (v: number | undefined, f: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v as number))) : f);
  return {
    retentionDays: clamp(input.retentionDays, fallback.retentionDays, RETENTION_LIMITS.retentionDays.min, RETENTION_LIMITS.retentionDays.max),
    keepLatest: clamp(input.keepLatest, fallback.keepLatest, RETENTION_LIMITS.keepLatest.min, RETENTION_LIMITS.keepLatest.max),
  };
}
