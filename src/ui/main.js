const decisionEl = document.getElementById("decision");
const whyEl = document.getElementById("why");
const hero = document.getElementById("hero");
const statusChip = document.getElementById("status-chip");
const statusLabel = document.getElementById("status-label");
const violations = document.getElementById("violations");
const modeChip = document.getElementById("mode-chip");
const honestyChip = document.getElementById("honesty-chip");
const exposure = document.getElementById("exposure");
const intentEl = document.getElementById("intent");
const audit = document.getElementById("audit");
const killCopy = document.getElementById("kill-copy");
const statNav = document.getElementById("stat-nav");
const statExp = document.getElementById("stat-exp");
const statLoss = document.getElementById("stat-loss");

const fmtUsd = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDT`
    : "—";
const fmtPct = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)}%` : "—");

async function getState() {
  const r = await fetch("/state");
  return r.json();
}

function paintDecision(d) {
  if (!d) return;
  const kind = d.decision.toLowerCase();
  decisionEl.textContent = d.decision;
  decisionEl.className = `verdict-word ${kind}`;
  hero.className = `verdict ${kind}`;
  whyEl.textContent = d.reasons?.[0] ?? "";
  const c = d.computed;
  if (c) {
    statNav.textContent = fmtUsd(c.nav_quote);
    statExp.textContent = fmtPct(c.projected_exposure_pct);
    statLoss.textContent = fmtPct(c.daily_loss_pct);
  }
  audit.textContent = JSON.stringify(
    {
      matched_rule_ids: d.matched_rule_ids,
      execution: d.execution,
      computed: d.computed,
    },
    null,
    2,
  );
}

function paintState(s) {
  const agent = s.agent ?? {};
  const live = agent.status !== "QUARANTINED";
  statusLabel.textContent = live ? "Live" : "Quarantined";
  statusChip.className = `chip ${live ? "chip--live" : "chip--dead"}`;
  const max = s.policy?.max_violations ?? 2;
  violations.textContent = `Violations ${agent.violation_count ?? 0}/${max}`;
  modeChip.textContent = `Mode ${s.execution_mode}`;
  const last = agent.last_decision;
  // Reflect the real execution posture from state — never assert more than happened.
  const sentLive = last?.execution?.mcp_result?.sent_to_binance === true;
  honestyChip.textContent = sentLive
    ? "live order sent"
    : s.execution_mode === "replay"
      ? "replay · no live order sent"
      : "no live order sent";
  paintDecision(last);
  const li = agent.last_intent;
  if (li && typeof li === "object") {
    const size = li.quoteOrderQty ?? li.notional_quote ?? li.amount;
    intentEl.textContent = JSON.stringify(
      {
        source: li.source ?? "ui",
        product: li.product,
        symbol: li.symbol ?? li.asset,
        side: li.side,
        type: li.type ?? "MARKET",
        ...(size !== undefined ? { quote_size: size } : {}),
        ...(li.quantity !== undefined ? { quantity: li.quantity } : {}),
        ...(li.leverage !== undefined ? { leverage: li.leverage } : {}),
        ...(li.prompt !== undefined ? { prompt: li.prompt } : {}),
        reason: li.reason ?? li.rationale,
      },
      null,
      2,
    );
  } else {
    intentEl.textContent = "none";
  }
  const c = last?.computed;
  exposure.textContent = c
    ? `NAV          ${fmtUsd(c.nav_quote)}\ncurrent      ${fmtPct(c.current_exposure_pct)}\nprojected    ${fmtPct(c.projected_exposure_pct)}\ndaily loss   ${fmtPct(c.daily_loss_pct)}`
    : "NAV from fixture (10,000 USDT) until live MCP is authorized.";
  if (s.kill_switch) killCopy.textContent = s.kill_switch.honesty;
}

async function refresh() {
  paintState(await getState());
}

for (const btn of document.querySelectorAll("button[data-beat]")) {
  btn.addEventListener("click", async () => {
    const beat = btn.getAttribute("data-beat");
    intentEl.textContent = beat;
    const r = await fetch(`/demo/${beat}`, { method: "POST" });
    const d = await r.json();
    paintDecision(d);
    await refresh();
    intentEl.textContent = JSON.stringify({ beat, decision: d.decision, reasons: d.reasons }, null, 2);
  });
}

document.getElementById("agent-propose").addEventListener("click", async () => {
  intentEl.textContent = "agent is reasoning…";
  const r = await fetch("/agent-propose", { method: "POST" });
  const { proposal, decision } = await r.json();
  paintDecision(decision);
  await refresh();
  // Show the agent's own proposal and where it came from — the real handoff.
  intentEl.textContent = JSON.stringify(
    {
      agent: proposal.origin === "llm" ? `proposed by ${proposal.model}` : `fallback (${proposal.fallback_reason})`,
      rationale: proposal.rationale,
      guardian_decision: decision.decision,
      reasons: decision.reasons,
    },
    null,
    2,
  );
});

document.getElementById("reset").addEventListener("click", async () => {
  await fetch("/reset-demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  decisionEl.textContent = "—";
  decisionEl.className = "verdict-word idle";
  hero.className = "verdict";
  whyEl.textContent = "Demo counter reset. Binance was not touched.";
  await refresh();
});

document.getElementById("kill").addEventListener("click", async () => {
  const info = await (await fetch("/open-binance-kill-switch", { method: "POST" })).json();
  killCopy.textContent = `${info.honesty} Path: ${info.path}. ${info.warning}`;
  if (info.url) window.open(info.url, "_blank", "noopener");
});

refresh();
