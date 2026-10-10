import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditDraft } from "./recorder.js";

/** What is known about the request being handled, so an event recorded deep inside the code knows which request it belongs to. */
export interface AuditContext {
  requestId: string;
  method: string;
  /** The route that matched, e.g. /api/programs/:programId/publish. */
  path: string;
  ip: string;
  userAgent?: string;
  /** Events the code recorded while handling this request; written once the response is sent, with its outcome. */
  pending: AuditDraft[];
}

export const auditContext = new AsyncLocalStorage<AuditContext>();
