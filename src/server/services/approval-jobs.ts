import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { createPspAdapter } from "../psp";
import { getPspConfig } from "./psp-config";
import { getEscrowById, setEscrowReleasePending } from "./escrows";

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function mapSupabaseServiceError(error: any) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toSafeErrorMessage(error: any) {
  if (!error) return "unknown_error";
  const code = error?.code ? String(error.code) : "";
  const message = error?.message ? String(error.message) : String(error);
  return code ? `${code}:${message}` : message;
}

async function claimApprovalJobByApprovalId(approvalId: string) {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("approval_jobs")
    .update({
      status: "IN_PROGRESS",
      started_at: nowIso,
      updated_at: nowIso
    })
    .eq("approval_id", approvalId)
    .in("status", ["PENDING", "FAILED"])
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapSupabaseServiceError(error);
  }
  return data || null;
}

async function markApprovalJobDone(jobId: string, attemptCount: number) {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from("approval_jobs")
    .update({
      status: "DONE",
      attempt_count: attemptCount,
      last_error: null,
      finished_at: nowIso,
      updated_at: nowIso
    })
    .eq("approval_job_id", jobId);
  if (error) {
    throw mapSupabaseServiceError(error);
  }
}

async function markApprovalJobFailed(jobId: string, attemptCount: number, lastError: string) {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from("approval_jobs")
    .update({
      status: "FAILED",
      attempt_count: attemptCount,
      last_error: lastError,
      finished_at: nowIso,
      updated_at: nowIso
    })
    .eq("approval_job_id", jobId);
  if (error) {
    throw mapSupabaseServiceError(error);
  }
}

async function executeEscrowConfirmReceivedJob(job: any) {
  const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
  const escrowId = typeof payload.escrow_id === "string" ? payload.escrow_id : null;
  if (!escrowId) {
    throw buildServiceError("approval job missing escrow_id", 400, "VALIDATION_ERROR");
  }

  const config = await getPspConfig();
  if (!config) {
    throw buildServiceError("PSP not configured", 409, "PSP_NOT_CONFIGURED");
  }

  const escrow = await getEscrowById(escrowId);
  if (!escrow) {
    throw buildServiceError("Escrow not found", 404, "ESCROW_NOT_FOUND");
  }

  const paymentId = escrow.psp_payment_id ? String(escrow.psp_payment_id) : null;
  if (!paymentId) {
    throw buildServiceError("Escrow payment not initialized", 409, "ESCROW_NOT_READY");
  }

  const adapter = createPspAdapter({ provider: config.provider as any, mode: config.mode as any });
  const release = await adapter.release({
    escrowId: escrow.escrow_id,
    paymentId,
    amountMinor: escrow.amount_gross_minor,
    currency: escrow.currency
  });

  await setEscrowReleasePending({ escrowId: escrow.escrow_id, payoutId: release.payoutId });
}

export async function processApprovalJobByApprovalId(approvalId: string) {
  if (!approvalId) return { processed: false, reason: "missing_approval_id" as const };

  const job = await claimApprovalJobByApprovalId(approvalId);
  if (!job) return { processed: false, reason: "no_pending_job" as const };

  const nextAttemptCount = Number(job?.attempt_count || 0) + 1;

  try {
    const actionType = String(job?.action_type || "");
    if (actionType === "escrow.confirm_received") {
      await executeEscrowConfirmReceivedJob(job);
    } else {
      throw buildServiceError(`Unsupported approval job action_type: ${actionType}`, 400, "VALIDATION_ERROR");
    }

    await markApprovalJobDone(String(job.approval_job_id), nextAttemptCount);
    return { processed: true, status: "DONE" as const };
  } catch (error: any) {
    const lastError = toSafeErrorMessage(error);
    await markApprovalJobFailed(String(job.approval_job_id), nextAttemptCount, lastError);
    throw error;
  }
}

