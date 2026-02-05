import { createAuditLogger } from "./logger.js";
import { createSupabaseAuditWriter } from "./supabase-writer.js";

let auditLogger;

export function getAuditLogger() {
  if (!auditLogger) {
    auditLogger = createAuditLogger({ write: createSupabaseAuditWriter() });
  }
  return auditLogger;
}

export async function safeAuditLog(event) {
  try {
    const logger = getAuditLogger();
    await logger(event);
  } catch (error) {
    console.error("[audit] failed", error);
  }
}

