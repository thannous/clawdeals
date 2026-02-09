export type PspProvider = "mock";
export type PspMode = "sandbox" | "production";

export type PspAccountUpdatedEvent = {
  id: string;
  type: "account.updated";
  created_at: string;
  data: {
    external_account_id: string;
    kyc_status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
    requirements_due?: any;
  };
};

export type PspPaymentSucceededEvent = {
  id: string;
  type: "payment.succeeded";
  created_at: string;
  data: {
    payment_id: string;
    hold_id?: string | null;
    hold_expires_at?: string | null;
  };
};

export type PspPayoutSucceededEvent = {
  id: string;
  type: "payout.succeeded";
  created_at: string;
  data: {
    payout_id: string;
  };
};

export type PspRefundSucceededEvent = {
  id: string;
  type: "refund.succeeded";
  created_at: string;
  data: {
    refund_id: string;
  };
};

export type PspWebhookEvent =
  | PspAccountUpdatedEvent
  | PspPaymentSucceededEvent
  | PspPayoutSucceededEvent
  | PspRefundSucceededEvent;

export type VerifyWebhookSignatureInput = {
  canonicalBody: string;
  headers: any;
  secret: string;
};

export type VerifyWebhookSignatureResult = { ok: true } | { ok: false; error: string };

export type CreateSellerOnboardingInput = {
  ownerId: string;
};

export type CreateSellerOnboardingResult = {
  externalAccountId: string;
  kycStatus: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  requirementsDue: any;
  url: string;
};

export type CreateCheckoutSessionInput = {
  escrowId: string;
  amountMinor: number | bigint;
  currency: string;
};

export type CreateCheckoutSessionResult = {
  paymentId: string;
  checkoutUrl: string;
  expiresAt: string;
};

export type ReleaseInput = {
  escrowId: string;
  paymentId: string;
  amountMinor: number | bigint;
  currency: string;
};

export type ReleaseResult = {
  payoutId: string;
};

export type RefundInput = {
  escrowId: string;
  paymentId: string;
  amountMinor: number | bigint;
  currency: string;
};

export type RefundResult = {
  refundId: string;
};

export interface PSPAdapter {
  provider: PspProvider;
  mode: PspMode;

  verifyWebhookSignature(input: VerifyWebhookSignatureInput): VerifyWebhookSignatureResult;
  parseWebhookEvent(body: any): PspWebhookEvent;

  createSellerOnboarding(input: CreateSellerOnboardingInput): Promise<CreateSellerOnboardingResult>;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>;
  release(input: ReleaseInput): Promise<ReleaseResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
