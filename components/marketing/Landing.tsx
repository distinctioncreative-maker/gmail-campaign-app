"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

/** "$8.25M" / "$185K" — MCA deal sizes read as rounded, spoken figures, not
 * fake-precise dollar counts. */
function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString()}`;
}

const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
);

/** One distinct line-icon per feature, so the grid reads as crafted, not stamped. */
function FeatureIcon({ name }: { name: string }) {
  const map: Record<string, React.ReactNode> = {
    "AI email writer": (<><path d="M4 20l.9-3.8L15.7 5.4a2 2 0 0 1 2.9 2.9L7.8 19.1 4 20Z" /><path d="M13.4 7.7l2.9 2.9" /></>),
    "Smart campaigns": (<><path d="M22 2 2 9.5l7.2 2.8L12 19.5 22 2Z" /><path d="M22 2 9.2 12.3" /></>),
    "Reply intelligence": (<><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10Z" /><path d="M8 9h8M8 12.5h5" /></>),
    "Deliverability guard": (<><path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9Z" /><path d="M9 11.5l2 2 4-4" /></>),
    "Lead command center": (<><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" /><path d="M3 12l9 4.5L21 12" /><path d="M3 16.5 12 21l9-4.5" /></>),
    "Team & reporting": (<><path d="M4 4v16h16" /><path d="M8 16v-3M12 16V8M16 16v-6" /></>),
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {map[name]}
    </svg>
  );
}

/** Count-up number that animates when it scrolls into view. */
function StatNum({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      const t = setTimeout(() => setN(value), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          const start = performance.now();
          const dur = 1400;
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / dur);
            setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return (
    <span ref={ref}>
      {prefix}
      {n.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Reusable email-capture field that posts to the public /api/waitlist. */
function WaitField({ source, cta, note }: { source: string; cta: string; note: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState("error");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className={styles.waitlist}>
        <div className={styles.wlSuccess} role="status">
          <CheckIcon />
          You&apos;re on the list. We&apos;ll email you when early access opens.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.waitlist}>
      <form className={styles.wlForm} onSubmit={submit} noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Work email"
          autoComplete="email"
          required
        />
        <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={state === "busy"}>
          {state === "busy" ? "Joining…" : cta}
        </button>
      </form>
      {state === "error" ? (
        <p className={styles.wlError}>Please enter a valid email address and try again.</p>
      ) : (
        <p className={styles.wlNote}>{note}</p>
      )}
    </div>
  );
}

const FEATURES = [
  { t: "AI email writer", d: "Describe the email in a sentence. Cadence writes a ready-to-send draft in your brand's voice, fresh every time, never a canned template.", tag: "Brand memory" },
  { t: "Smart campaigns", d: "Pick your leads, pick a pace, launch. Sends spread naturally across the day, so you stay under Gmail's limits and out of spam.", tag: "Human-paced sending" },
  { t: "Reply intelligence", d: "Every reply is tagged Interested, Needs reply, or Not now, and one click drafts an on-brand response right in the thread.", tag: "Triage plus AI drafts" },
  { t: "Deliverability guard", d: "SPF, DKIM, DMARC, and Postmaster reputation, checked for you, so you know you'll land in the inbox before you hit send.", tag: "Domain health" },
  { t: "Lead command center", d: "Paste from Salesforce or drop in a CSV. Cadence dedupes the mess and files everyone into clean, reusable lists.", tag: "Import and lists" },
  { t: "Team & reporting", d: "Team-lead dashboards, per-rep leaderboards, and honest reports on sends, reply rates, and your best campaigns.", tag: "Roles and leaderboards" },
];

// The payoff, framed as a switch: same job, minus the friction.
const OLD_WAY = [
  "20 minutes writing every email from a blank page",
  "Hot replies buried in a noisy, crowded inbox",
  "Spam-folder roulette on every send",
  "Another login, and a whole new sending service to learn",
];
const NEW_WAY = [
  "On-brand drafts in seconds, personalized to each lead",
  "Every reply tagged, sorted, and drafted for you",
  "Auth checks and paced sending, so you land in the inbox",
  "Connect your own Gmail and start, nothing new to learn",
];

const SECURITY = [
  { t: "Per-user data isolation", d: "Every rep's leads, campaigns, and replies live in their own scoped space. No one crosses that line." },
  { t: "Encrypted Gmail tokens", d: "We connect to Gmail with a narrow scope and store your token encrypted with a managed key, never in plain text." },
  { t: "Test-mode safety gate", d: "Until you flip an org to live, every email is redirected to your own address. No send path skips the gate." },
  { t: "Deny-by-default database", d: "Direct data access is blocked at the database itself. The server is the only path in, and it checks every request." },
  { t: "Verified background jobs", d: "Every automated send is cryptographically verified as coming from our own service, so no one else can trigger it." },
  { t: "We never sell your data", d: "Your leads and email content are yours. We don't sell, share, or train third-party models on them. Full stop." },
];

const DEMO_BODY = `Hi Jordan,

Congrats on the new location. Momentum like that runs on cash flow, and Alpine gets working capital to businesses like yours in days, not weeks, with payback that flexes to your revenue.

Open to a quick 10-minute call Thursday?`;

/** Isolated so the ~30ms/char state updates re-render only this node, not the
 * whole landing page (which caused scroll jank). */
function TypedDraft() {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout>;
    if (reduce) {
      timer = setTimeout(() => setTyped(DEMO_BODY), 0);
      return () => clearTimeout(timer);
    }
    let i = 0;
    const step = () => {
      i += 1;
      setTyped(DEMO_BODY.slice(0, i));
      if (i < DEMO_BODY.length) {
        timer = setTimeout(step, 20 + Math.random() * 34);
      } else {
        timer = setTimeout(() => {
          i = 0;
          setTyped("");
          timer = setTimeout(step, 500);
        }, 4000);
      }
    };
    timer = setTimeout(step, 700);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={styles.mailBody}>
      {typed}
      <span className={styles.caret} />
    </div>
  );
}

/**
 * Hero animation: the one distinctive visual for the whole page. Two lanes
 * of outreach sweep up and out of the inbox on the left — mass mailing as a
 * visible stream, not a single thin thread — a share peels off as a reply
 * and slams into a live, self-leveling pipeline stack on the right, and a
 * huge translucent watermark of the running total dominates the scene
 * behind it all. "Send → reply → revenue" as one continuous, unmistakably
 * large shape instead of three quiet stats. Isolated (own state) and
 * paused when scrolled off-screen, so it never taxes the rest of the page.
 */
function HeroPipeline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState({ sent: 1284, rep: 96, rev: 8250000 });
  const [deals, setDeals] = useState<Array<{ id: number; label: string; xPct: number; yPct: number; big: boolean }>>([]);
  const dealIdRef = useRef(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = (a: number, b: number) => a + Math.random() * (b - a);
    const ease = (a: number, b: number, f: number) => a + (b - a) * f;
    // Real MCA deal sizes, not toy numbers — rounded to how funders actually
    // quote them ("a $185K deal"), not a fake-precise $184,732.
    const dealAmount = () => Math.round(rng(10, 500) / 5) * 5 * 1000;

    // Two converging lanes (upper + lower) instead of one thin thread — the
    // shape itself reads as "mass mailing," not a single careful email.
    const inboxX = W * 0.065, inboxY = H * 0.5;
    const deliverX = W * 0.76, deliverY = H * 0.5;
    const lanes = [
      { ctrlX: W * 0.4, ctrlY: H * 0.06 },
      { ctrlX: W * 0.4, ctrlY: H * 0.9 },
    ];
    const bezier = (t: number, lane: number) => {
      const { ctrlX, ctrlY } = lanes[lane];
      const u = 1 - t;
      return {
        x: u * u * inboxX + 2 * u * t * ctrlX + t * t * deliverX,
        y: u * u * inboxY + 2 * u * t * ctrlY + t * t * deliverY,
      };
    };

    const BAR_COUNT = 6;
    // Kept well clear of the right edge — the deal popup's glow is wide
    // enough that a bar sitting too close to the frame clips its label.
    const barBaseX = W * 0.78, barBaseY = H * 0.86, barMaxH = H * 0.58, barGap = W * 0.024;
    const bars = Array.from({ length: BAR_COUNT }, () => ({ h: rng(10, 40), target: rng(10, 40) }));

    // Slow drifting depth field behind everything — cheap parallax that
    // keeps the scene from reading as a flat, empty rectangle.
    const STAR_COUNT = 46;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: rng(0, W), y: rng(0, H), r: rng(0.6, 1.8), phase: rng(0, Math.PI * 2), speed: rng(0.15, 0.4),
    }));

    interface Env { t: number; speed: number; lane: number; reply: boolean; big: boolean; }
    interface Drop { p: number; from: { x: number; y: number }; to: { x: number; y: number }; bar: number; amount: number; }
    interface Burst { x: number; y: number; age: number; big: boolean; }
    const envelopes: Env[] = [];
    const drops: Drop[] = [];
    const bursts: Burst[] = [];

    let sent = stats.sent, rep = stats.rep, rev = stats.rev;
    let spawnClock = 0;
    let lastTime = 0;

    const spawnEnvelope = (lane: number) => {
      const reply = Math.random() < 0.32;
      envelopes.push({ t: 0, speed: rng(0.3, 0.4), lane, reply, big: reply && Math.random() < 0.3 });
    };

    const drawStars = (time: number) => {
      for (const s of stars) {
        const tw = 0.35 + 0.25 * Math.sin(time / 900 + s.phase);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${tw * 0.4})`;
        const x = (s.x + time * 0.006 * s.speed) % W;
        ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawLanes = () => {
      for (let lane = 0; lane < lanes.length; lane++) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 2;
        ctx.setLineDash([1, 9]);
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const { x, y } = bezier(t, lane);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    const pointAt = (e: Env, t: number) => bezier(t, e.lane);

    const drawEnvelope = (e: Env) => {
      const color = e.reply ? "#30d158" : "#5eb3ff";
      const fade = Math.min(1, e.t * 8) * Math.min(1, (1 - e.t) * 8 + 0.15);
      const scale = e.big ? 1.7 : 1;

      // Longer, brighter trail — this is what turns dots into a fast,
      // purposeful streak instead of a Pong ball.
      for (let i = 9; i >= 1; i--) {
        const tt = Math.max(0, e.t - i * 0.01);
        const { x, y } = pointAt(e, tt);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.globalAlpha = fade * (1 - i / 10) * 0.4;
        ctx.arc(x, y, (e.reply ? 5 : 3.6) * scale * (1 - i / 11), 0, Math.PI * 2);
        ctx.fill();
      }

      const { x, y } = pointAt(e, e.t);
      const angle = Math.atan2(
        pointAt(e, Math.min(1, e.t + 0.01)).y - y,
        pointAt(e, Math.min(1, e.t + 0.01)).x - x
      );
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = (e.reply ? 26 : 18) * scale;
      ctx.globalAlpha = fade;
      // Small envelope silhouette, not a plain dot.
      const w = (e.reply ? 12 : 9) * scale, h = w * 0.68;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawInboxNode = (time: number) => {
      const pulse = 9 + Math.sin(time / 300) * 2.2;
      ctx.beginPath();
      ctx.fillStyle = "#0a84ff";
      ctx.shadowColor = "#0a84ff";
      ctx.shadowBlur = 30;
      ctx.arc(inboxX, inboxY, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(10,132,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.arc(inboxX, inboxY, pulse + 8 + Math.sin(time / 300) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const drawBars = () => {
      for (let i = 0; i < BAR_COUNT; i++) {
        const b = bars[i];
        b.h = ease(b.h, b.target, 0.1);
        const x = barBaseX + i * barGap;
        const h = Math.min(barMaxH, b.h);
        const bw = 14;
        const grad = ctx.createLinearGradient(0, barBaseY, 0, barBaseY - h);
        grad.addColorStop(0, "rgba(48,209,88,0.5)");
        grad.addColorStop(0.7, "rgba(120,240,170,0.9)");
        grad.addColorStop(1, "rgba(220,255,235,1)");
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(x - bw / 2, barBaseY);
        ctx.lineTo(x - bw / 2, barBaseY - h + r);
        ctx.arcTo(x - bw / 2, barBaseY - h, x - bw / 2 + r, barBaseY - h, r);
        ctx.lineTo(x + bw / 2 - r, barBaseY - h);
        ctx.arcTo(x + bw / 2, barBaseY - h, x + bw / 2, barBaseY - h + r, r);
        ctx.lineTo(x + bw / 2, barBaseY);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.shadowColor = "rgba(48,209,88,0.5)";
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Bright glowing cap on top — makes the bars read as "alive," not static fills.
        ctx.beginPath();
        ctx.fillStyle = "#eafff2";
        ctx.shadowColor = "#eafff2";
        ctx.shadowBlur = 14;
        ctx.arc(x, barBaseY - h, bw / 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.moveTo(barBaseX - 24, barBaseY + 0.5);
      ctx.lineTo(barBaseX + (BAR_COUNT - 1) * barGap + 24, barBaseY + 0.5);
      ctx.stroke();
    };

    const drawDrops = (dt: number) => {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.p += dt * 1.9;
        const big = d.amount >= 300000;
        if (d.p >= 1) {
          bursts.push({ x: d.to.x, y: d.to.y, age: 0, big });
          // Bigger deals visibly slam the bar chart harder than small ones.
          const growth = 10 + (d.amount / 500000) * 46;
          bars[d.bar].target = Math.min(barMaxH, bars[d.bar].target + growth);
          const id = dealIdRef.current++;
          // Clamped so a wide "big deal" glow never clips against the frame,
          // even for a bar sitting near the edge.
          const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
          setDeals((prev) => [
            ...prev,
            {
              id,
              label: formatMoney(d.amount),
              xPct: clamp((d.to.x / W) * 100, 12, 78),
              yPct: clamp((d.to.y / H) * 100, 16, 78),
              big,
            },
          ]);
          setTimeout(() => setDeals((prev) => prev.filter((deal) => deal.id !== id)), big ? 2200 : 1600);
          drops.splice(i, 1);
          continue;
        }
        const p = d.p;
        const x = ease(d.from.x, d.to.x, p);
        const y = ease(d.from.y, d.to.y, p) - Math.sin(p * Math.PI) * (big ? 60 : 40); // gentle hop, then drop
        const r = big ? 5.5 : 4;
        ctx.beginPath();
        ctx.fillStyle = "#30d158";
        ctx.shadowColor = "#30d158";
        ctx.shadowBlur = big ? 22 : 15;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawBursts = () => {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += 1;
        const life = b.big ? 44 : 28;
        const p = b.age / life;
        if (p >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        const maxR = b.big ? 80 : 44;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(48,209,88,${(1 - p) * 0.65})`;
        ctx.lineWidth = b.big ? 3 : 2;
        ctx.arc(b.x, b.y, 6 + p * maxR, 0, Math.PI * 2);
        ctx.stroke();
        if (b.big) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(245,197,106,${(1 - p) * 0.5})`;
          ctx.lineWidth = 2;
          ctx.arc(b.x, b.y, 4 + p * maxR * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    const draw = (time: number) => {
      const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
      lastTime = time;
      ctx.clearRect(0, 0, W, H);

      drawStars(time);
      drawLanes();
      drawBars();

      spawnClock += dt;
      if (spawnClock > 0.3) {
        spawnClock = 0;
        spawnEnvelope(Math.random() < 0.5 ? 0 : 1);
      }

      for (let i = envelopes.length - 1; i >= 0; i--) {
        const e = envelopes[i];
        e.t += dt * e.speed;
        if (e.t >= 1) {
          sent += 1;
          if (e.reply) {
            rep += 1;
            const amount = e.big ? Math.round(rng(300, 500) / 5) * 5 * 1000 : dealAmount();
            rev += amount;
            const shortest = bars.reduce((min, b, idx) => (b.target < bars[min].target ? idx : min), 0);
            const barX = barBaseX + shortest * barGap;
            drops.push({
              p: 0,
              from: { x: deliverX, y: deliverY },
              to: { x: barX, y: barBaseY - bars[shortest].target },
              bar: shortest,
              amount,
            });
          }
          envelopes.splice(i, 1);
          continue;
        }
        drawEnvelope(e);
      }

      drawDrops(dt);
      drawInboxNode(time);
      drawBursts();
    };

    if (reduce) {
      // Static, representative frame — no motion, no faked "live" numbers.
      for (let i = 0; i < BAR_COUNT; i++) bars[i].h = bars[i].target = rng(30, barMaxH * 0.85);
      for (let i = 0; i < 6; i++) envelopes.push({ t: rng(0.15, 0.85), speed: 0, lane: i % 2, reply: i % 2 === 0, big: false });
      draw(0);
      return;
    }

    let raf = 0, running = false;
    const loop = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!running) {
        running = true;
        lastTime = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    // Only animate while the canvas is actually on screen.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.05 }
    );
    io.observe(cv);
    const id = setInterval(() => setStats({ sent, rep, rev }), 200);
    return () => {
      io.disconnect();
      stop();
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${styles.pipeStage} ${styles.reveal}`}>
      <div className={styles.pipeGlass}>
        <div className={styles.pipeTop}>
          <span className={styles.pipeTag}>Live outreach</span>
          <span className={styles.pipeTagR}>Every send compounds into pipeline</span>
        </div>
        <div className={styles.pipeCanvasWrap}>
          <div className={styles.pipeWatermark} aria-hidden="true">{formatMoney(stats.rev)}</div>
          <canvas ref={canvasRef} width={1920} height={640} aria-hidden="true" />
          <div className={styles.pipeEndpoint} style={{ left: "5%" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2 2 9.5l7.2 2.8L12 19.5 22 2Z" />
              <path d="M22 2 9.2 12.3" />
            </svg>
            Outreach
          </div>
          <div className={`${styles.pipeEndpoint} ${styles.pipeEndpointR}`} style={{ right: "3%" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4v16h16" />
              <path d="M8 16v-3M12 16V8M16 16v-6" />
            </svg>
            Pipeline
          </div>
          {deals.map((d) => (
            <div
              key={d.id}
              className={`${styles.pipeDeal} ${d.big ? styles.pipeDealBig : ""}`}
              style={{ left: `${d.xPct}%`, top: `${d.yPct}%` }}
            >
              <span className={styles.pipeDealGlow} aria-hidden="true" />
              <span className={styles.pipeDealEmoji} aria-hidden="true">{d.big ? "🤑" : "💰"}</span>
              <span className={styles.pipeDealAmount}>{d.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.pipeStats}>
          <div className={styles.pipeChip}>
            <div className={styles.pipeVal}>{stats.sent.toLocaleString()}</div>
            <div className={styles.pipeLab}>Emails sent</div>
          </div>
          <div className={styles.pipeChip}>
            <div className={styles.pipeVal} style={{ color: "var(--accent)" }}>{stats.rep.toLocaleString()}</div>
            <div className={styles.pipeLab}>Replies earned</div>
          </div>
          <div className={styles.pipeChip}>
            <div className={styles.pipeVal} style={{ color: "var(--good)" }}>{formatMoney(stats.rev)}</div>
            <div className={styles.pipeLab}>Pipeline (simulated)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Scroll reveal
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = rootRef.current?.querySelectorAll(`.${styles.reveal}`);
    if (!els) return;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add(styles.in));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add(styles.in);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Nav */}
      <nav className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navIn}`}>
          <div className={styles.brand}>
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="29" height="29" rx="9" stroke="#2e8bff" strokeWidth="1.6" opacity="0.35" />
              <path d="M5 17.5h4.2l2.4-7.4a1 1 0 0 1 1.9.03l3.3 11.2 2.2-5.1a1 1 0 0 1 .9-.6H27" stroke="#2e8bff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cadence
          </div>
          <div className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#demos">Demos</a>
            <a href="#pricing">Pricing</a>
            <a href="#security">Security</a>
          </div>
          <div className={styles.navCta}>
            <a href="/sign-in" className={styles.login}>Log in</a>
            <a href="#waitlist" className={`${styles.btn} ${styles.btnPrimary}`}>Join the waitlist</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.wrap}>
          <span className={styles.heroBadge}>Private early access · <b>Coming soon</b></span>
          <h1>
            Reach more. <span className={styles.grad}>Land more.</span> Earn more.
          </h1>
          <p className={styles.sub}>
            Cadence sends personalized campaigns from your own Gmail, clears the deliverability
            bar most tools miss, and turns every reply into revenue — at a pace built to protect
            the sender reputation your pipeline depends on.
          </p>
          <div id="waitlist">
            <WaitField
              source="hero"
              cta="Get early access"
              note={<>Sends from <b>your own Gmail</b>. No credit card. We&apos;ll only email you about early access.</>}
            />
            <p className={styles.heroLogin}>Already have early access? <a href="/sign-in">Log in →</a></p>
          </div>

          {/* Live pipeline animation (isolated component, paused off-screen) */}
          <HeroPipeline />
        </div>
      </header>

      {/* Stats band */}
      <section className={styles.statsBand}>
        <div className={styles.wrap}>
          <div className={`${styles.stats} ${styles.reveal}`}>
            <div className={styles.stat}>
              <div className={styles.statVal}><StatNum value={100} suffix="/day" /></div>
              <div className={styles.statLab}>Tuned pacing, not a race to Gmail&apos;s limit</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}><StatNum value={100} suffix="%" /></div>
              <div className={styles.statLab}>Sent from your own Gmail, nothing spoofed</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}><StatNum value={3} /></div>
              <div className={styles.statLab}>Deliverability checks before every send</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}><StatNum value={60} prefix="<" suffix="s" /></div>
              <div className={styles.statLab}>To an on-brand draft with AI</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={`${styles.bandLight} ${styles.pad}`} id="features">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.reveal}`}>
            <span className={styles.eyebrow}>The platform</span>
            <h2>Everything a modern outreach team needs, nothing it doesn&apos;t.</h2>
            <p>From the first import to the booked call, Cadence handles the busywork so your reps can spend their time selling.</p>
          </div>
          <div className={styles.features}>
            {FEATURES.map((f) => (
              <div className={`${styles.feat} ${styles.reveal}`} key={f.t}>
                <div className={styles.ic}>
                  <FeatureIcon name={f.t} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
                <span className={styles.tag}>{f.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demos */}
      <section className={`${styles.bandInk2} ${styles.pad}`} id="demos">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.center} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center" }}>See it in motion</span>
            <h2>A closer look at Cadence.</h2>
            <p>From a one-line prompt to a booked call. Here&apos;s the everyday flow.</p>
          </div>

          {/* Demo 1: AI writer */}
          <div className={`${styles.demo} ${styles.reveal}`}>
            <div className={styles.demoCopy}>
              <span className={styles.eyebrow}>AI email writer</span>
              <h3>Describe it once. Get an on-brand draft.</h3>
              <p>Cadence remembers your offer and tone, then writes a fresh, personalized email every time. No templates to wrestle with.</p>
              <ul>
                <li><CheckIcon size={17} />Brand memory keeps every message true to your pitch.</li>
                <li><CheckIcon size={17} />Personalized per lead, never copy-paste.</li>
                <li><CheckIcon size={17} />Improve, shorten, or spin subject lines in a click.</li>
              </ul>
            </div>
            <div className={styles.frame}>
              <div className={styles.frameBar}><i /><i /><i /><span>compose · cadence</span></div>
              <div className={styles.frameBody}>
                <div className={styles.aiwTop}>
                  <span className={styles.aiwChip}>✦ Writing with AI</span>
                  <span className={styles.aiwBrand}>Brand: <b>Alpine</b></span>
                </div>
                <div className={styles.aiwMail}>
                  <div className={styles.subj}>Subject · Working capital for your next move</div>
                  <TypedDraft />
                </div>
                <div className={styles.aiwTools}>
                  <span>Improve</span><span>Shorten</span><span>Subject lines</span><span>Regenerate</span>
                </div>
              </div>
            </div>
          </div>

          {/* Demo 2: Reply inbox */}
          <div className={`${styles.demo} ${styles.demoRev} ${styles.demoGap} ${styles.reveal}`}>
            <div className={styles.frame}>
              <div className={styles.frameBar}><i /><i /><i /><span>replies · triaged</span></div>
              <div className={styles.frameBody}>
                <div className={styles.inbox}>
                  {[
                    { who: "Jordan Reyes", snip: "“This is timely, can you send details?”", chip: "Interested", cls: styles.hot, action: <span className={styles.draft}>AI draft ready →</span> },
                    { who: "Priya Nair", snip: "“Who handles this on your side?”", chip: "Needs reply", cls: styles.warm, action: <span className={styles.draft}>AI draft ready →</span> },
                    { who: "Marcus Webb", snip: "“Not right now, maybe next quarter.”", chip: "Not now", cls: styles.cold, action: <span className={styles.openG}>Snoozed</span> },
                  ].map((r) => (
                    <div className={styles.reply} key={r.who}>
                      <div>
                        <div className={styles.who}>{r.who}</div>
                        <div className={styles.snip}>{r.snip}</div>
                      </div>
                      <span className={`${styles.chip} ${r.cls}`}>{r.chip}</span>
                      {r.action}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.demoCopy}>
              <span className={styles.eyebrow}>Reply intelligence</span>
              <h3>Every reply, sorted and ready to answer.</h3>
              <p>Cadence reads each response, tags the intent, and floats the hot ones first, then drafts an on-brand reply right in the Gmail thread.</p>
              <ul>
                <li><CheckIcon size={17} />Interested, Needs reply, Not now, tagged automatically.</li>
                <li><CheckIcon size={17} />One click drafts a reply in the real thread.</li>
                <li><CheckIcon size={17} />Hot leads rise to the top so nothing slips.</li>
              </ul>
            </div>
          </div>

          {/* Demo 3: Deliverability */}
          <div className={`${styles.demo} ${styles.demoGap} ${styles.reveal}`}>
            <div className={styles.demoCopy}>
              <span className={styles.eyebrow}>Deliverability guard</span>
              <h3>Know you&apos;ll land before you send.</h3>
              <p>Zero-setup checks for SPF, DKIM, and DMARC plus Gmail Postmaster reputation, with human-paced sending that keeps you off spam filters.</p>
              <ul>
                <li><CheckIcon size={17} />Domain auth checked automatically.</li>
                <li><CheckIcon size={17} />Sends spread across the day, never in bursts.</li>
                <li><CheckIcon size={17} />Reputation monitored so issues surface early.</li>
                <li><CheckIcon size={17} />Pacing backed by real, anonymized data from every Cadence sender, not a guess.</li>
              </ul>
            </div>
            <div className={styles.frame}>
              <div className={styles.frameBar}><i /><i /><i /><span>deliverability · health</span></div>
              <div className={styles.frameBody}>
                <div className={styles.deliv}>
                  <div className={styles.gauge}>
                    <div className={styles.gaugeInner}>
                      <div>
                        <div className={styles.score}>94</div>
                        <div className={styles.gaugeLab}>Inbox score</div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.checks}>
                    {[["SPF", "Pass"], ["DKIM", "Pass"], ["DMARC", "Pass"], ["Postmaster", "Good"]].map(([k, v]) => (
                      <div className={styles.checkrow} key={k}>
                        <b>{k}</b><span className={styles.pass}>✓ {v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value / what you save */}
      <section className={`${styles.bandLight} ${styles.pad}`} id="value">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.center} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center" }}>Why teams switch</span>
            <h2>Trade the busywork for booked calls.</h2>
            <p>The same outreach your reps already do, minus the parts that drain the day.</p>
          </div>
          <div className={`${styles.compare} ${styles.reveal}`}>
            <div className={`${styles.col} ${styles.colBad}`}>
              <div className={styles.colHead}><XIcon size={15} /> The old way</div>
              <ul className={styles.cmp}>
                {OLD_WAY.map((x) => (
                  <li key={x}><XIcon size={17} />{x}</li>
                ))}
              </ul>
            </div>
            <div className={`${styles.col} ${styles.colGood}`}>
              <div className={styles.colHead}><CheckIcon size={15} /> With Cadence</div>
              <ul className={styles.cmp}>
                {NEW_WAY.map((x) => (
                  <li key={x}><CheckIcon size={17} />{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className={`${styles.bandInk2} ${styles.pad}`} id="security">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.center} ${styles.reveal}`}>
            <span className={styles.eyebrow}>Data safety</span>
            <h2>Your leads, your inbox, your data, locked down.</h2>
            <p>Cadence is built defense-in-depth. Your data is isolated, your credentials are encrypted, and nothing is ever sold or shared.</p>
          </div>
          <div className={styles.secGrid}>
            {SECURITY.map((s) => (
              <div className={`${styles.sec} ${styles.reveal}`} key={s.t}>
                <div className={styles.lk}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={`${styles.bandLight} ${styles.pad}`} id="pricing">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.center} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center" }}>Pricing</span>
            <h2>Simple plans, coming at launch.</h2>
            <p>Final pricing lands when early access opens. Join the waitlist for founding-member rates.</p>
          </div>
          <div className={styles.prices}>
            {/* Starter */}
            <div className={`${styles.price} ${styles.reveal}`}>
              <div className={styles.plan}>Starter</div>
              <div className={styles.amt}>$29 <small>/ seat · mo</small></div>
              <span className={styles.soon}>Coming soon</span>
              <p className={styles.who2}>For a solo rep who wants to send smarter.</p>
              <ul>
                <li><CheckIcon size={16} />AI email writer with brand memory</li>
                <li><CheckIcon size={16} />Human-paced campaigns from your Gmail</li>
                <li><CheckIcon size={16} />Reply triage and AI drafts</li>
                <li><CheckIcon size={16} />Deliverability checks</li>
              </ul>
              <a href="#waitlist" className={`${styles.btn} ${styles.btnLight}`}>Join the waitlist</a>
            </div>
            {/* Team: featured */}
            <div className={`${styles.price} ${styles.featPlan} ${styles.reveal}`}>
              <span className={styles.badgeTop}>Most popular</span>
              <div className={styles.plan}>Team</div>
              <div className={styles.amt}>$24 <small>/ seat · mo</small></div>
              <span className={styles.soon}>Coming soon</span>
              <p className={styles.who2}>For teams selling together, with full visibility.</p>
              <ul>
                <li><CheckIcon size={16} />Everything in Starter</li>
                <li><CheckIcon size={16} />Roles, assignment, and team dashboards</li>
                <li><CheckIcon size={16} />Per-rep leaderboards and reporting</li>
                <li><CheckIcon size={16} />Shared brand memory profiles</li>
              </ul>
              <a href="#waitlist" className={`${styles.btn} ${styles.btnLight} ${styles.btnLightPri}`}>Join the waitlist</a>
            </div>
            {/* Enterprise */}
            <div className={`${styles.price} ${styles.reveal}`}>
              <div className={styles.plan}>Enterprise</div>
              <div className={styles.amt}>Custom</div>
              <span className={styles.soon}>Coming soon</span>
              <p className={styles.who2}>For orgs with security, scale, and SSO needs.</p>
              <ul>
                <li><CheckIcon size={16} />Everything in Team</li>
                <li><CheckIcon size={16} />SSO and advanced data controls</li>
                <li><CheckIcon size={16} />Custom limits and dedicated onboarding</li>
                <li><CheckIcon size={16} />Priority support and SLA</li>
              </ul>
              <a href="#waitlist" className={`${styles.btn} ${styles.btnLight}`}>Contact us</a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${styles.bandInk2} ${styles.pad}`} id="faq">
        <div className={styles.wrap}>
          <div className={`${styles.head} ${styles.center} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center" }}>Questions</span>
            <h2>Everything you might be wondering.</h2>
          </div>
          <div className={`${styles.faq} ${styles.reveal}`}>
            {[
              ["When does Cadence launch?", "We're rolling out private early access in waves. Join the waitlist and we'll email you the moment a seat opens for you."],
              ["Do I need a new email service?", "No. Cadence sends from your own Gmail with a narrow, revocable permission. Your identity, your inbox, real threads. Nothing is spoofed or relayed."],
              ["Is my data safe?", "Yes. Every rep's data is isolated, your Gmail token is encrypted with a managed key, database access is deny-by-default, and we never sell, share, or train third-party models on your data."],
              ["Will this hurt my deliverability?", "The opposite. Cadence spreads sends across the day, checks SPF, DKIM, DMARC, and your Postmaster reputation before every send, and tunes your pacing against real, anonymized data from every campaign on the platform, not a one-size-fits-all default."],
              ["How much will it cost?", "Final pricing is set at launch. Waitlist members get founding-member rates, so join now to lock in the best pricing."],
              ["Can my whole team use it?", "Yes. Cadence has roles, lead assignment, per-rep leaderboards, and team-lead dashboards built in from day one."],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${styles.bandInk2} ${styles.pad} ${styles.final}`}>
        <div className={styles.aurora} aria-hidden="true" />
        <div className={`${styles.wrap} ${styles.finalInner}`}>
          <span className={styles.eyebrow} style={{ justifyContent: "center" }}>Be first in line</span>
          <h2>Get early access to Cadence.</h2>
          <p className={styles.sub} style={{ margin: "16px auto 0" }}>
            Join the waitlist and we&apos;ll invite you the moment your seat is ready.
          </p>
          <WaitField source="footer-cta" cta="Join the waitlist" note={<>No spam, ever. One email when it&apos;s your turn.</>} />
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.foot}`}>
          <div className={styles.brand} style={{ fontSize: 17 }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M5 17.5h4.2l2.4-7.4a1 1 0 0 1 1.9.03l3.3 11.2 2.2-5.1a1 1 0 0 1 .9-.6H27" stroke="#2e8bff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cadence
          </div>
          <div className={styles.cols}>
            <a href="#features">Features</a>
            <a href="#demos">Demos</a>
            <a href="#pricing">Pricing</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className={styles.fine}>© 2026 Cadence · Private early access</div>
        </div>
      </footer>
    </div>
  );
}
