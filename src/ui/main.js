const decisionEl = document.getElementById("decision");
const whyEl = document.getElementById("why");
const hero = document.getElementById("hero");
const statusChip = document.getElementById("status-chip");
const violations = document.getElementById("violations");
const modeChip = document.getElementById("mode-chip");
const exposure = document.getElementById("exposure");
const intentEl = document.getElementById("intent");
const audit = document.getElementById("audit");
const killCopy = document.getElementById("kill-copy");

async function getState() {
  const r = await fetch("/state");
  return r.json();
}

function paintDecision(d) {
  if (!d) return;
  const kind = d.decision.toLowerCase();
  decisionEl.textContent = d.decision;
  decisionEl.className = `decision ${kind}`;
  hero.className = `hero ${kind}`;
  whyEl.textContent = d.reasons?.[0] ?? "";
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
  statusChip.textContent = live ? "LIVE" : "QUARANTINED";
  statusChip.className = `chip ${live ? "live" : "dead"}`;
  const max = s.policy?.max_violations ?? 2;
  violations.textContent = `violations ${agent.violation_count ?? 0}/${max}`;
  modeChip.textContent = `MODE ${s.execution_mode}`;
  const last = agent.last_decision;
  paintDecision(last);
  const c = last?.computed;
  exposure.textContent = c
    ? `NAV ${c.nav_quote} USDT\ncurrent ${c.current_exposure_pct.toFixed(2)}%\nprojected ${c.projected_exposure_pct.toFixed(2)}%\ndaily loss ${c.daily_loss_pct.toFixed(2)}%`
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

document.getElementById("reset").addEventListener("click", async () => {
  await fetch("/reset-demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  decisionEl.textContent = "—";
  decisionEl.className = "decision idle";
  hero.className = "hero";
  whyEl.textContent = "Demo counter reset. Binance was not touched.";
  await refresh();
});

document.getElementById("kill").addEventListener("click", async () => {
  const info = await (await fetch("/open-binance-kill-switch", { method: "POST" })).json();
  killCopy.textContent = `${info.honesty} Path: ${info.path}. ${info.warning}`;
  if (info.url) window.open(info.url, "_blank", "noopener");
});

refresh();
