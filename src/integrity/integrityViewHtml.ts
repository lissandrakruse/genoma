import type * as vscode from "vscode";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getIntegrityHtml(webview: vscode.Webview): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Integrity Dashboard</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --card: #ffffff;
      --ink: #0f1720;
      --muted: #5f6d7a;
      --line: #d7dee5;
      --accent: #0ea5a8;
      --ok: #1f8a4d;
      --warn: #b96a00;
      --bad: #b42318;
    }
    body {
      margin: 0;
      padding: 14px;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background: radial-gradient(1200px 400px at 5% -10%, #dff5f6 0%, var(--bg) 55%);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: .2px;
    }
    .badge {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 999px;
      font-weight: 700;
      border: 1px solid var(--line);
      background: #eef3f6;
    }
    .ok { color: var(--ok); border-color: #bde2ca; background: #edf9f1; }
    .warn { color: var(--warn); border-color: #f0d0a5; background: #fff8ec; }
    .bad { color: var(--bad); border-color: #efc2bf; background: #fff1f0; }
    button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 13px;
      letter-spacing: .2px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .bar-wrap {
      width: 100%;
      background: #edf2f6;
      border-radius: 999px;
      overflow: hidden;
      height: 8px;
      margin-top: 3px;
    }
    .bar {
      height: 8px;
      background: linear-gradient(90deg, #0ea5a8, #15b8bc);
    }
    .muted { color: var(--muted); font-size: 12px; }
    .kpi {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px;
      background: #fbfcfd;
    }
    .metric .k { font-size: 10px; color: var(--muted); text-transform: uppercase; }
    .metric .v { margin-top: 3px; font-weight: 700; font-size: 14px; word-break: break-word; }
    .donut-wrap {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 12px;
      align-items: center;
    }
    .donut {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 1px solid var(--line);
      position: relative;
    }
    .donut::after {
      content: "";
      position: absolute;
      inset: 24px;
      border-radius: 50%;
      background: var(--card);
      border: 1px solid var(--line);
    }
    .legend {
      font-size: 12px;
      display: grid;
      gap: 6px;
    }
    .legend .i { display:flex; justify-content:space-between; gap:8px; }
    .dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px; }
    .footer {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="top">
    <div class="title">Integrity Dashboard</div>
    <div style="display:flex; gap:8px; align-items:center;">
      <span id="integrityBadge" class="badge">loading...</span>
      <span id="pgpBadge" class="badge">PGP: loading...</span>
      <button id="refreshBtn">Refresh</button>
      <button id="exportPngBtn">Export PNG</button>
    </div>
  </div>

  <div class="grid">
    <section class="card">
      <h3>Governance Compliance by Domain</h3>
      <div id="domainList" class="muted">No data yet.</div>
    </section>

    <section class="card">
      <h3>Evidence Source Distribution</h3>
      <div id="evidencePanel" class="muted">No evidence data yet.</div>
    </section>

    <section class="card">
      <h3>Seal Health + Research Identity</h3>
      <div class="kpi" id="sealKpis"></div>
    </section>
  </div>

  <div class="footer" id="footerMeta">Waiting for workspace metrics...</div>

  <script>
    const vscode = acquireVsCodeApi();
    const colors = ["#0ea5a8", "#2563eb", "#f97316", "#7c3aed", "#16a34a", "#dc2626", "#64748b"];
    let currentPayload = null;

    function esc(v){ return String(v == null ? "" : v).replace(/[<>&]/g, (m) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m])); }
    function toBadgeClass(status){
      if (status === "ok") return "badge ok";
      if (status === "warn") return "badge warn";
      return "badge bad";
    }

    function renderDomains(domains){
      const root = document.getElementById("domainList");
      if (!domains || !domains.length) {
        root.innerHTML = '<div class="muted">No domain data in selected window.</div>';
        return;
      }
      root.innerHTML = domains.map((d) => {
        const p = Number(d.validationSuccessRate || 0).toFixed(1);
        const r = Number(d.rollbackRate || 0).toFixed(1);
        const b = Number(d.blockRate || 0).toFixed(1);
        return '<div class="row">'
          + '<div>'
          + '<div><strong>' + esc(d.domain) + '</strong> <span class="muted">(' + esc(d.chains) + ' chains)</span></div>'
          + '<div class="bar-wrap"><div class="bar" style="width:' + Math.max(0, Math.min(100, p)) + '%;"></div></div>'
          + '<div class="muted">validation ' + p + '% · rollback ' + r + '% · block ' + b + '%</div>'
          + '</div>'
          + '</div>';
      }).join("");
    }

    function renderEvidence(sources){
      const root = document.getElementById("evidencePanel");
      if (!sources || !sources.length) {
        root.innerHTML = '<div class="muted">No evidence-source records found.</div>';
        return;
      }
      let cumulative = 0;
      const parts = sources.map((s, i) => {
        const start = cumulative;
        cumulative += Number(s.pct || 0);
        const color = colors[i % colors.length];
        return color + ' ' + start + '% ' + cumulative + '%';
      });
      const donut = '<div class="donut" style="background:conic-gradient(' + parts.join(", ") + ');"></div>';
      const legend = '<div class="legend">'
        + sources.map((s, i) => {
          const color = colors[i % colors.length];
          return '<div class="i"><div><span class="dot" style="background:' + color + ';"></span>' + esc(s.source) + '</div><div>' + esc(Number(s.pct || 0).toFixed(1)) + '% (' + esc(s.count) + ')</div></div>';
        }).join("")
        + '</div>';
      root.innerHTML = '<div class="donut-wrap">' + donut + legend + '</div>';
    }

    function renderSeal(payload){
      const seal = payload.sealHealth || {};
      const identity = payload.identity || {};
      const rep = payload.reproducibility || { overallScore: 0, components: {} };
      const pgp = payload.pgpHealth || {};
      const verify = payload.evidencePackageVerification || {};
      const kpis = [
        ["Reproducibility", (rep.overallScore == null ? "0.0" : Number(rep.overallScore).toFixed(1)) + "/100"],
        ["Seal Integrity", ((rep.components || {}).sealIntegrity == null ? "0.0" : Number(rep.components.sealIntegrity).toFixed(1)) + "/100"],
        ["Evidence Diversity", ((rep.components || {}).evidenceDiversity == null ? "0.0" : Number(rep.components.evidenceDiversity).toFixed(1)) + "/100"],
        ["Validation Quality", ((rep.components || {}).validationQuality == null ? "0.0" : Number(rep.components.validationQuality).toFixed(1)) + "/100"],
        ["Rollback Stability", ((rep.components || {}).rollbackStability == null ? "0.0" : Number(rep.components.rollbackStability).toFixed(1)) + "/100"],
        ["Seal File", seal.latestSealFile || "not found"],
        ["Algorithm", seal.algorithm || "-"],
        ["Strict Verify", seal.strictVerified === null ? "n/a" : (seal.strictVerified ? "ok" : "failed")],
        ["Seal Age", seal.sealAgeHours === null || seal.sealAgeHours === undefined ? "n/a" : String(seal.sealAgeHours) + "h"],
        ["Seal Stale", seal.stale === null ? "n/a" : (seal.stale ? "yes" : "no")],
        ["Digest", seal.digest ? String(seal.digest).slice(0, 20) + "..." : "-"],
        ["PGP Status", pgp.status || "not_configured"],
        ["PGP Fingerprint", pgp.fingerprint ? String(pgp.fingerprint).slice(-16) : "-"],
        ["Can Sign", pgp.canSign == null ? "n/a" : (pgp.canSign ? "yes" : "no")],
        ["Evidence Sig", verify.signatureValid == null ? "n/a" : (verify.signatureValid ? "valid" : "invalid")],
        ["Evidence Files", verify.manifestFileCount == null ? "n/a" : String(verify.manifestFileCount)],
        ["Evidence Check", verify.allFilesValid == null ? "n/a" : (verify.allFilesValid ? "ok" : "mismatch")],
        ["Actor", identity.actorId || "-"],
        ["ORCID", identity.orcidId || "-"],
      ];
      document.getElementById("sealKpis").innerHTML = kpis.map(([k, v]) =>
        '<div class="metric"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'
      ).join("");
    }

    function renderMeta(payload){
      const from = payload.window && payload.window.from ? new Date(payload.window.from).toLocaleString() : "-";
      const to = payload.window && payload.window.to ? new Date(payload.window.to).toLocaleString() : "-";
      const d = payload.diagnostics || {};
      const verify = payload.evidencePackageVerification || {};
      document.getElementById("footerMeta").textContent =
        'Window: ' + from + ' - ' + to
        + ' | applyChain: ' + (d.hasApplyChain ? 'yes' : 'no')
        + ' | inferenceCustody: ' + (d.hasInferenceCustody ? 'yes' : 'no')
        + ' | evidenceVerify: ' + (verify.file ? String(verify.file) : 'none')
        + ' | generatedAt: ' + (payload.generatedAt || '-');
    }

    function setBadge(payload){
      const seal = payload.sealHealth || {};
      const domains = payload.compliance && payload.compliance.domains ? payload.compliance.domains : [];
      const avgRollback = domains.length ? domains.reduce((a, d) => a + Number(d.rollbackRate || 0), 0) / domains.length : 0;
      let status = "warn";
      let label = "Integrity partial";
      if (seal.strictVerified === false) {
        status = "bad";
        label = "Seal failed";
      } else if (seal.stale === true) {
        status = "warn";
        label = "Seal stale";
      } else if (seal.strictVerified === true && avgRollback <= 15) {
        status = "ok";
        label = "Integrity healthy";
      } else if (seal.strictVerified === true) {
        status = "warn";
        label = "Integrity warning";
      } else if (seal.strictVerified === null) {
        status = "warn";
        label = "No seal";
      }
      const badge = document.getElementById("integrityBadge");
      badge.className = toBadgeClass(status);
      badge.textContent = label;
    }

    function setPgpBadge(payload){
      const pgp = payload.pgpHealth || {};
      let status = "warn";
      let label = "PGP not configured";
      if (pgp.status === "ok") {
        status = "ok";
        label = "PGP key ready";
      } else if (pgp.status === "missing") {
        status = "bad";
        label = "PGP key missing";
      } else if (pgp.status === "ambiguous") {
        status = "warn";
        label = "PGP key ambiguous";
      } else if (pgp.status === "gpg_unavailable") {
        status = "bad";
        label = "GPG unavailable";
      }
      const badge = document.getElementById("pgpBadge");
      badge.className = toBadgeClass(status);
      badge.textContent = label;
    }

    function render(payload){
      currentPayload = payload;
      renderDomains((payload.compliance || {}).domains || []);
      renderEvidence(payload.evidenceSources || []);
      renderSeal(payload);
      renderMeta(payload);
      setBadge(payload);
      setPgpBadge(payload);
    }

    document.getElementById("refreshBtn").addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
    document.getElementById("exportPngBtn").addEventListener("click", () => {
      if (!currentPayload) { return; }
      exportPng(currentPayload);
    });

    function exportPng(payload){
      const width = 1400;
      const height = 900;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { return; }

      ctx.fillStyle = "#f4f6f8";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#0f1720";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("GENOMA Integrity Dashboard", 40, 56);
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#5f6d7a";
      ctx.fillText("Generated at: " + String(payload.generatedAt || "-"), 40, 84);

      const card = (x, y, w, h, title) => {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#d7dee5";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#5f6d7a";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(title, x + 14, y + 24);
      };

      card(40, 110, 640, 330, "Governance Compliance");
      card(720, 110, 640, 330, "Evidence Source Distribution");
      card(40, 470, 1320, 360, "Seal + Identity + Reproducibility");

      const domains = ((payload.compliance || {}).domains || []).slice(0, 8);
      let y = 150;
      domains.forEach((d) => {
        const p = Math.max(0, Math.min(100, Number(d.validationSuccessRate || 0)));
        ctx.fillStyle = "#0f1720";
        ctx.font = "13px sans-serif";
        ctx.fillText(String(d.domain || "unclassified"), 56, y + 10);
        ctx.fillStyle = "#edf2f6";
        ctx.fillRect(230, y, 410, 12);
        ctx.fillStyle = "#0ea5a8";
        ctx.fillRect(230, y, 410 * (p / 100), 12);
        ctx.fillStyle = "#5f6d7a";
        ctx.fillText(p.toFixed(1) + "%", 650, y + 10);
        y += 34;
      });

      const sources = (payload.evidenceSources || []).slice(0, 6);
      const total = sources.reduce((a, s) => a + Number(s.count || 0), 0) || 1;
      let start = 0;
      const cx = 890;
      const cy = 255;
      const radius = 120;
      sources.forEach((s, i) => {
        const angle = (Number(s.count || 0) / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        start += angle;
      });
      ctx.beginPath();
      ctx.arc(cx, cy, 58, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      let ly = 160;
      sources.forEach((s, i) => {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(1035, ly - 10, 10, 10);
        ctx.fillStyle = "#0f1720";
        ctx.font = "13px sans-serif";
        ctx.fillText(String(s.source || "unknown"), 1055, ly);
        ctx.fillStyle = "#5f6d7a";
        ctx.fillText((Number(s.pct || 0)).toFixed(1) + "%", 1260, ly);
        ly += 26;
      });

      const rep = payload.reproducibility || { overallScore: 0, components: {} };
      const seal = payload.sealHealth || {};
      const identity = payload.identity || {};
      const stats = [
        ["Reproducibility", Number(rep.overallScore || 0).toFixed(1) + "/100"],
        ["Seal Integrity", Number((rep.components || {}).sealIntegrity || 0).toFixed(1) + "/100"],
        ["Evidence Diversity", Number((rep.components || {}).evidenceDiversity || 0).toFixed(1) + "/100"],
        ["Validation Quality", Number((rep.components || {}).validationQuality || 0).toFixed(1) + "/100"],
        ["Rollback Stability", Number((rep.components || {}).rollbackStability || 0).toFixed(1) + "/100"],
        ["Strict Verify", seal.strictVerified === true ? "ok" : seal.strictVerified === false ? "failed" : "n/a"],
        ["Seal Age", seal.sealAgeHours == null ? "n/a" : String(seal.sealAgeHours) + "h"],
        ["Actor", identity.actorId || "-"],
        ["ORCID", identity.orcidId || "-"],
      ];
      let sx = 56;
      let sy = 520;
      stats.forEach((pair, idx) => {
        if (idx > 0 && idx % 3 === 0) {
          sy += 92;
          sx = 56;
        }
        ctx.fillStyle = "#fbfcfd";
        ctx.strokeStyle = "#d7dee5";
        ctx.fillRect(sx, sy, 410, 76);
        ctx.strokeRect(sx, sy, 410, 76);
        ctx.fillStyle = "#5f6d7a";
        ctx.font = "11px sans-serif";
        ctx.fillText(pair[0], sx + 12, sy + 24);
        ctx.fillStyle = "#0f1720";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(String(pair[1]), sx + 12, sy + 52);
        sx += 430;
      });

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\\/png;base64,/, "");
      vscode.postMessage({ type: "exportPngData", payload: { base64 } });
    }

    window.addEventListener("message", (event) => {
      const msg = event.data || {};
      if (msg.type === "snapshot" && msg.payload) {
        render(msg.payload);
      }
      if (msg.type === "requestExportPng" && currentPayload) {
        exportPng(currentPayload);
      }
    });
  </script>
</body>
</html>`;
}
