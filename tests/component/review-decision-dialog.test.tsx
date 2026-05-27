import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewDecisionDialog } from "@/components/knowledge/ReviewDecisionDialog";
import { LocaleProvider } from "@/lib/i18n/client";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Component test: the review decision dialog renders three radio options
 * (approve / request_changes / reject) and enforces that a comment is
 * present when the decision is anything but `approved`. The submit handler
 * fetches `/api/knowledge/<slug>/review`; here we stub `fetch` and assert
 * call shape rather than running it through the real API.
 *
 * `useRouter().refresh()` and the toast helper are dependencies of the
 * dialog; we mock the router and wrap in `<ToastProvider>` so the dialog
 * mounts in a usable state.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

const dict = {
  common: {
    cancel: "Cancel",
    working: "Working...",
    error: "Something went wrong.",
  },
  knowledge: {
    review: {
      decideTitle: "Decide on this article",
      submitDecision: "Submit decision",
      commentRequired:
        "A comment is required when requesting changes or rejecting.",
      decision: {
        label: "Decision",
        approved: "Approve",
        approvedHelp: "The article meets the bar. Ready to publish.",
        approvedSuccess: "Approved.",
        changes_requested: "Request changes",
        changes_requestedHelp: "Author should revise and resubmit.",
        changes_requestedSuccess: "Changes requested.",
        rejected: "Reject",
        rejectedHelp: "Not appropriate for the knowledge base.",
        rejectedSuccess: "Rejected.",
        comment: "Comment",
        commentPlaceholder:
          "Required when requesting changes or rejecting.",
      },
    },
  },
} as unknown as Parameters<typeof LocaleProvider>[0]["dict"];

function renderDialog() {
  return render(
    <LocaleProvider locale="en" dict={dict}>
      <ToastProvider>
        <ReviewDecisionDialog
          open={true}
          onOpenChange={vi.fn()}
          slug="vpn-howto"
          articleTitle="VPN setup guide"
        />
      </ToastProvider>
    </LocaleProvider>,
  );
}

describe("ReviewDecisionDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the dialog title, the article title, and the three radio options", () => {
    renderDialog();
    expect(screen.getByText("Decide on this article")).toBeInTheDocument();
    expect(screen.getByText("VPN setup guide")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Approve/ })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Request changes/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Reject/ })).toBeInTheDocument();
  });

  it("defaults the decision to 'approved' (no comment required)", () => {
    renderDialog();
    const approveRadio = screen.getByRole("radio", {
      name: /Approve/,
    }) as HTMLInputElement;
    expect(approveRadio.checked).toBe(true);
  });

  it("shows the commentRequired error when submitting request_changes without a comment", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Request changes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit decision" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          "A comment is required when requesting changes or rejecting.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows the commentRequired error when submitting reject without a comment", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Reject/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit decision" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          "A comment is required when requesting changes or rejecting.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("submits to /api/knowledge/<slug>/review when approve is chosen (no comment required)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Submit decision" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/knowledge/vpn-howto/review",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const callBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    ) as { decision: string };
    expect(callBody.decision).toBe("approved");
  });
});
