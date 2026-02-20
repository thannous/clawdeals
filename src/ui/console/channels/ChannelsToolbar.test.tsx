import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";

import ChannelsToolbar from "./ChannelsToolbar";

type ToolbarProps = ComponentProps<typeof ChannelsToolbar>;

function makeProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    state: "PENDING",
    onStateChange: vi.fn(),
    channelType: "",
    onChannelTypeChange: vi.fn(),
    approveRole: "approver",
    onApproveRoleChange: vi.fn(),
    pairingCode: "",
    onPairingCodeChange: vi.fn(),
    lookupAction: {
      onLookup: vi.fn(),
      state: "idle"
    },
    ...overrides
  };
}

describe("ChannelsToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("runs lookup action and disables Find while lookup is loading", () => {
    const onLookup = vi.fn();
    const { rerender } = render(
      <ChannelsToolbar
        {...makeProps({
          lookupAction: {
            onLookup,
            state: "idle"
          }
        })}
      />
    );

    const findButton = screen.getByRole("button", { name: "Find" }) as HTMLButtonElement;
    expect(findButton.disabled).toBe(false);
    fireEvent.click(findButton);
    expect(onLookup).toHaveBeenCalledTimes(1);

    rerender(
      <ChannelsToolbar
        {...makeProps({
          lookupAction: {
            onLookup,
            state: "loading"
          }
        })}
      />
    );

    expect((screen.getByRole("button", { name: "Find" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides telegram action when telegram connect action is not provided", () => {
    render(<ChannelsToolbar {...makeProps()} />);
    expect(screen.queryByTestId("channels-connect-telegram")).toBeNull();
  });

  it("renders telegram button states and wiring from telegram action state", () => {
    const onConnect = vi.fn();
    const { rerender } = render(
      <ChannelsToolbar
        {...makeProps({
          telegramConnectAction: {
            onConnect,
            state: "idle"
          }
        })}
      />
    );

    const connectButton = screen.getByTestId("channels-connect-telegram") as HTMLButtonElement;
    expect(connectButton.textContent).toBe("Connect Telegram");
    expect(connectButton.disabled).toBe(false);
    fireEvent.click(connectButton);
    expect(onConnect).toHaveBeenCalledTimes(1);

    rerender(
      <ChannelsToolbar
        {...makeProps({
          telegramConnectAction: {
            onConnect,
            state: "loading"
          }
        })}
      />
    );

    const loadingButton = screen.getByTestId("channels-connect-telegram") as HTMLButtonElement;
    expect(loadingButton.textContent).toBe("Starting…");
    expect(loadingButton.disabled).toBe(true);

    rerender(
      <ChannelsToolbar
        {...makeProps({
          telegramConnectAction: {
            onConnect,
            state: "disabled"
          }
        })}
      />
    );

    const disabledButton = screen.getByTestId("channels-connect-telegram") as HTMLButtonElement;
    expect(disabledButton.textContent).toBe("Connect Telegram");
    expect(disabledButton.disabled).toBe(true);
  });
});
