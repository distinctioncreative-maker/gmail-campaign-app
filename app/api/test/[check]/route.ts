import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { handleApiErrors } from "@/lib/api";
import { getConnectionPublic } from "@/lib/repositories/gmailConnections";
import { getSenderProfile } from "@/lib/repositories/userSettings";
import { sendEmail } from "@/lib/gmail/send";
import { parseSalesforceText } from "@/lib/parser/salesforce";
import { renderForPreview } from "@/lib/personalization/preview";
import { classifyInboundMessage } from "@/lib/gmail/classifyReply";
import { classifyBounce, isBounceMessage } from "@/lib/gmail/classifyBounce";
import { SPEC_SAMPLE } from "@/tests/fixtures/salesforce-sample";

type CheckResult = { pass: boolean; detail: string };

/**
 * Test Center checks (spec §22). Every check is safe: email sends are
 * forced to the logged-in user's address and pass through the TEST_MODE
 * safety gate. No real recipient state is ever modified.
 */
export const POST = handleApiErrors(
  async (_req: NextRequest, { params }: { params: Promise<{ check: string }> }) => {
    const ctx = await requireUser();
    const { check } = await params;
    let result: CheckResult;

    switch (check) {
      case "gmail-connection": {
        const conn = await getConnectionPublic(ctx.userId);
        result =
          conn?.status === "CONNECTED"
            ? { pass: true, detail: `Connected as ${conn.connectedEmail}.` }
            : { pass: false, detail: "Gmail is not connected. Connect it in Settings." };
        break;
      }

      case "send-test-email": {
        const send = await sendEmail({
          userId: ctx.userId,
          to: ctx.email,
          subject: "Test Center check",
          htmlBody: "<p>This is a Test Center email. If you received it, sending works.</p>",
        });
        result = {
          pass: true,
          detail: `Sent to ${send.effectiveTo} with subject "${send.effectiveSubject}".`,
        };
        break;
      }

      case "parser": {
        const parsed = parseSalesforceText(SPEC_SAMPLE);
        const ok = parsed.totalRecords === 5 && parsed.leads[3].requestedAmount === null;
        result = {
          pass: ok,
          detail: ok
            ? "Parsed the sample list correctly, including the record with no amount."
            : "The parser did not handle the sample as expected.",
        };
        break;
      }

      case "personalization": {
        const rendered = await renderForPreview(
          ctx,
          "Hi {{first_name}} at {{business_name}}",
          "<p>Hi {{first_name}}, from {{sender_name}}.</p>",
          null
        );
        result = {
          pass: rendered.unresolved.length === 0,
          detail:
            rendered.unresolved.length === 0
              ? `Placeholders filled in: "${rendered.subject}"`
              : `Unfilled placeholders: ${rendered.unresolved.join(", ")} — complete your sender profile.`,
        };
        break;
      }

      case "profile-complete": {
        const profile = await getSenderProfile(ctx);
        const missing: string[] = [];
        if (!profile.physicalAddress.trim()) missing.push("company address");
        if (!profile.unsubscribeText.trim()) missing.push("opt-out sentence");
        if (!profile.senderName.trim()) missing.push("your name");
        result = {
          pass: missing.length === 0,
          detail:
            missing.length === 0
              ? "Your sender profile has everything required for sending."
              : `Missing: ${missing.join(", ")}. Add these in Settings.`,
        };
        break;
      }

      case "reply-detection": {
        const cls = classifyInboundMessage({
          headers: {},
          subject: "Re: Funding",
          snippet: "Sure, let's talk.",
          bodyText: "Sure, let's talk Thursday.",
        });
        const unsub = classifyInboundMessage({
          headers: {},
          subject: "",
          snippet: "",
          bodyText: "please unsubscribe me",
        });
        result = {
          pass: cls === "HUMAN_REPLY" && unsub === "UNSUBSCRIBE",
          detail: "Reply detection correctly identifies human replies and unsubscribe requests.",
        };
        break;
      }

      case "bounce-detection": {
        const msg = {
          from: "MAILER-DAEMON@google.com",
          subject: "Delivery Status Notification (Failure)",
          bodyText: "5.1.1 The email account does not exist.",
        };
        result = {
          pass: isBounceMessage(msg) && classifyBounce(msg) === "HARD",
          detail: "Bounce detection recognizes delivery failures and classifies hard bounces.",
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown check." }, { status: 400 });
    }

    return NextResponse.json(result);
  }
);
