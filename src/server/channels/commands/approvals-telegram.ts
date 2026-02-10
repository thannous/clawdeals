import { CARD_COMMAND_IDS } from "../cards/ids";
import type { Card } from "../cards/types";

export type ApprovalCardItem = {
  approvalId: string;
  index: number;
  actionText: string;
  reasonText: string | null;
  contextText: string | null;
  riskLevel: "LOW" | "MED" | "HIGH";
};

export function buildApprovalsCard({
  items,
  nextCursorToken,
  flash
}: {
  items: ApprovalCardItem[];
  nextCursorToken: string | null;
  flash?: string | null;
}): Card {
  const bullets: string[] = [];
  const actions: any[] = [];

  if (flash) {
    bullets.push(String(flash));
    bullets.push("");
  }

  if (!items.length) {
    bullets.push("Aucune approval en attente.");
  } else {
    for (const item of items) {
      if (bullets.length) bullets.push("---");
      bullets.push(`[${item.index}] ${item.actionText} | risk=${item.riskLevel}`);
      if (item.reasonText) bullets.push(`reason: ${item.reasonText}`);
      if (item.contextText) bullets.push(`ctx: ${item.contextText}`);
      bullets.push(`id: ${item.approvalId}`);

      const row = item.index; // 1-based index; keep it stable in UI.
      actions.push({
        action_id: "",
        label: `Approve ${item.index}`,
        command_id: "approvals.approve",
        args: { id: item.approvalId },
        row
      });
      actions.push({
        action_id: "",
        label: `Deny ${item.index}`,
        command_id: "approvals.deny",
        args: { id: item.approvalId },
        row
      });
    }
  }

  const baseRow = (items.length ? items[items.length - 1].index : 0) + 1;

  actions.push({
    action_id: "approvals.back",
    label: "Back",
    command_id: CARD_COMMAND_IDS.MENU_HOME,
    row: baseRow
  });

  if (nextCursorToken) {
    actions.push({
      action_id: "",
      label: "Next",
      command_id: "approvals.page",
      args: { c: nextCursorToken },
      row: baseRow
    });
  }

  return {
    title: "Approvals",
    subtitle: items.length ? `PENDING: ${items.length}${nextCursorToken ? "+" : ""}` : "PENDING: 0",
    bullets,
    actions,
    entity_ref: { type: "approvals.page", id: nextCursorToken ? String(nextCursorToken) : "first" }
  };
}
