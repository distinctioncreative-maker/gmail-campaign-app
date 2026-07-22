/**
 * Turns raw Home metrics into a short, human "mission briefing" sentence and
 * a set of suggested next actions — the JARVIS-style summary. Pure and
 * unit-tested; no data access here.
 */

export interface BriefingInput {
  gmailConnected: boolean;
  activeCampaigns: number;
  unreadReplies: number;
  repliesThisWeek: number;
  sentThisWeek: number;
  totalLeads: number;
  hasCampaigns: boolean;
}

export interface Suggestion {
  href: string;
  label: string;
  icon: string; // IconName
}

export interface Briefing {
  sentence: string;
  suggestions: Suggestion[];
  /** A terse status word for the hero pill. */
  status: "SENDING" | "REPLIES" | "READY" | "SETUP";
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Join clauses like "A, B, and C". */
function joinClauses(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function buildBriefing(m: BriefingInput): Briefing {
  // Not connected yet — the only thing that matters.
  if (!m.gmailConnected) {
    return {
      sentence:
        "let's get you set up — connect your Gmail and you'll be ready to send in under a minute.",
      status: "SETUP",
      suggestions: [
        { href: "/settings", label: "Connect Gmail", icon: "shield" },
        { href: "/leads", label: "Import leads", icon: "users" },
      ],
    };
  }

  const clauses: string[] = [];
  if (m.activeCampaigns > 0) {
    clauses.push(
      `${plural(m.activeCampaigns, "campaign is", "campaigns are")} sending right now`
    );
  }
  if (m.unreadReplies > 0) {
    clauses.push(`${plural(m.unreadReplies, "new reply is", "new replies are")} waiting`);
  } else if (m.repliesThisWeek > 0) {
    clauses.push(`${plural(m.repliesThisWeek, "reply", "replies")} came in this week`);
  }
  if (m.sentThisWeek > 0) {
    clauses.push(`${plural(m.sentThisWeek, "email", "emails")} went out this week`);
  }

  let sentence: string;
  let status: Briefing["status"];
  if (clauses.length > 0) {
    sentence = `${joinClauses(clauses)}.`;
    status = m.unreadReplies > 0 ? "REPLIES" : m.activeCampaigns > 0 ? "SENDING" : "READY";
  } else if (m.hasCampaigns) {
    sentence = "all quiet on the wire — nothing sending. Ready to launch the next one?";
    status = "READY";
  } else {
    sentence = "your outreach starts here. Import a list, write one email, and let it run.";
    status = "READY";
  }

  // Context-aware suggestions, most useful first.
  const suggestions: Suggestion[] = [];
  if (m.unreadReplies > 0) {
    suggestions.push({ href: "/replies", label: "Read your replies", icon: "check" });
  }
  suggestions.push({ href: "/campaigns/new", label: "Start a campaign", icon: "rocket" });
  if (m.totalLeads < 50) {
    suggestions.push({ href: "/leads", label: "Add more leads", icon: "users" });
  } else {
    suggestions.push({ href: "/templates/new", label: "Write a template", icon: "mail" });
  }
  if (suggestions.length < 3) {
    suggestions.push({ href: "/reports", label: "See analytics", icon: "chart" });
  }

  return { sentence, suggestions: suggestions.slice(0, 3), status };
}
