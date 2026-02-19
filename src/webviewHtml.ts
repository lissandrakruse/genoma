import * as vscode from "vscode";

export function getHtml(webview: vscode.Webview) {
  const nonce = String(Date.now());

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src ${webview.cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ollama Copilot</title>
<style>
  :root{
    --bgA: #08121c;
    --bgB: #0f1f31;
    --panel: rgba(18, 32, 47, 0.72);
    --panelStrong: rgba(17, 31, 46, 0.92);
    --border: rgba(148, 172, 197, 0.24);
    --muted: rgba(142, 174, 205, 0.12);
    --text: #dbe7f3;
    --textSoft: #9eb3c8;
    --primary: #14b8a6;
    --primarySoft: rgba(20, 184, 166, 0.14);
    --primaryBorder: rgba(20, 184, 166, 0.44);
    --danger: #ef4444;
    --ok: #16a34a;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI Variable","IBM Plex Sans","Noto Sans",sans-serif;
    margin: 0;
    padding: 0;
    color: var(--text);
    background:
      radial-gradient(circle at 6% -10%, rgba(20,184,166,0.16), transparent 40%),
      radial-gradient(circle at 100% 0%, rgba(59,130,246,0.18), transparent 42%),
      linear-gradient(160deg, var(--bgA), var(--bgB));
  }
  .wrap {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 12px;
    height: 100vh;
    padding: 12px;
  }
  .left {
    padding: 12px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panelStrong);
    backdrop-filter: blur(8px);
    animation: fadeIn .28s ease-out both;
  }
  .right {
    display:flex;
    flex-direction:column;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panelStrong);
    overflow: hidden;
    animation: fadeIn .32s ease-out both;
  }
  .left-head { margin-bottom: 8px; }
  .left-head .topbar { display:flex; gap: 8px; align-items: center; justify-content: space-between; }
  h3 { margin: 0; letter-spacing: .2px; font-size: 18px; font-weight: 650; }
  label { font-size: 11px; color: var(--textSoft); display:block; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .5px; }
  select, input, textarea {
    width: 100%;
    padding: 10px 11px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: rgba(11, 22, 35, 0.6);
    color: var(--text);
    transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
  }
  select:focus, input:focus, textarea:focus {
    outline: none;
    border-color: var(--primaryBorder);
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
    background: rgba(11, 22, 35, 0.82);
  }
  textarea { resize: vertical; min-height: 72px; }
  .chat { flex: 1; overflow: auto; padding: 16px; min-width: 0; background: linear-gradient(180deg, rgba(11,22,35,.30), rgba(11,22,35,.08)); }
  .composer {
    display:flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--border);
    background: rgba(10, 19, 29, 0.7);
  }
  .composer textarea { flex: 1; min-height: 44px; max-height: 180px; }
  button {
    padding: 10px 12px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
    transition: transform .12s ease, border-color .16s ease, background .16s ease;
  }
  button:hover { transform: translateY(-1px); border-color: rgba(20, 184, 166, 0.32); }
  button.primary {
    background: linear-gradient(135deg, #0ea5a4, #14b8a6);
    border-color: rgba(20, 184, 166, .72);
    color: #072220;
    font-weight: 650;
  }
  .seg {
    background: rgba(11, 22, 35, 0.8);
    border-color: var(--border);
  }
  .seg.active {
    background: var(--primarySoft);
    border-color: var(--primaryBorder);
    color: #99f6e4;
    font-weight: 650;
  }
  .cloud-panel {
    margin-top: 8px;
    border: 1px solid rgba(20, 184, 166, 0.3);
    border-radius: 10px;
    padding: 8px;
    background: rgba(20, 184, 166, 0.08);
  }
  .hidden {
    display: none;
  }
  button.danger { background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.36); color: #fecaca; }
  .row { display:flex; gap: 8px; align-items: center; }
  .row > * { flex: 1; }
  .msg {
    max-width: 980px;
    margin: 10px 0;
    padding: 11px 13px;
    border-radius: 12px;
    border: 1px solid var(--border);
    white-space: pre-wrap;
    animation: rise .2s ease-out both;
    line-height: 1.38;
  }
  .msg pre {
    margin: 8px 0;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: rgba(8, 12, 18, 0.72);
    overflow-x: auto;
    position: relative;
  }
  .code-copy {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 11px;
    padding: 4px 7px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: rgba(11, 22, 35, 0.9);
    color: var(--textSoft);
  }
  .msg code {
    font-family: Consolas, "JetBrains Mono", monospace;
    font-size: 12px;
  }
  .msg p { margin: 0 0 8px; }
  .msg ul { margin: 0 0 8px 18px; padding: 0; }
  .msg a { color: #67e8f9; text-decoration: underline; }
  .msg .kw { color: #93c5fd; font-weight: 600; }
  .msg-actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
  }
  .msg-actions button {
    padding: 4px 8px;
    font-size: 11px;
    border-radius: 8px;
  }
  .me {
    background: linear-gradient(160deg, rgba(20,184,166,.18), rgba(20,184,166,.10));
    border-color: var(--primaryBorder);
  }
  .ai { background: rgba(147, 197, 253, .06); }
  .small { font-size: 12px; color: var(--textSoft); line-height: 1.35; margin-top: 4px; }
  .badge { display:inline-block; font-size: 11px; opacity:.9; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); margin-right: 6px; }
  .badge.ok { border-color: rgba(27,154,89,.35); background: rgba(27,154,89,.10); }
  .badge.err { border-color: rgba(214,31,31,.35); background: rgba(214,31,31,.10); }
  .health-badge {
    display: inline-block;
    font-size: 11px;
    opacity: .95;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: rgba(148, 172, 197, 0.1);
    margin-top: 6px;
  }
  .health-badge.good { border-color: rgba(27,154,89,.35); background: rgba(27,154,89,.10); }
  .health-badge.excellent { border-color: rgba(22,163,74,.45); background: rgba(22,163,74,.18); }
  .health-badge.fair { border-color: rgba(234,179,8,.4); background: rgba(234,179,8,.12); }
  .health-badge.learning { border-color: rgba(148, 163, 184, .4); background: rgba(148,163,184,.14); }
  .pill {
    display:inline-block;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    margin-right: 6px;
    margin-bottom: 6px;
    cursor: pointer;
    user-select: none;
    font-size: 12px;
  }
  .pill.active { background: var(--primarySoft); border-color: var(--primaryBorder); color: #99f6e4; }
  .section {
    margin-top: 10px;
    padding: 11px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    animation: rise .26s ease-out both;
  }
  .hint { font-size: 11px; color: var(--textSoft); margin-top: 6px; line-height: 1.35; }
  .preset-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .preset { text-align:left; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    border: 1px solid var(--border);
    background: rgba(148, 172, 197, 0.1);
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11px;
    cursor: pointer;
  }
  .favorites { display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow: auto; }
  .fav-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
    background: rgba(8, 12, 18, 0.45);
    font-size: 11px;
    line-height: 1.3;
    cursor: pointer;
  }
  .mono { font-family: Consolas, "JetBrains Mono", monospace; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 980px) {
    .wrap { grid-template-columns: 1fr; grid-template-rows: minmax(260px, 42vh) 1fr; }
    .left { border-radius: 14px; }
    .right { border-radius: 14px; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="left">
    <div class="left-head">
      <div class="topbar">
        <h3>Codex-Style Copilot</h3>
        <button id="toggleAdvanced">Avancado</button>
      </div>
    <div class="small" id="status">Loading...</div>
    <div class="hint" id="meta"></div>
    <div class="hint" id="metrics">Perf | avg: - | validate: - | rollback: -</div>
    <div class="hint" id="heatmap" style="white-space: pre-wrap;">Heatmap | loading...</div>
    <div class="hint" style="margin-top:6px;">Domain Heatmap (click row to draft a domain governance prompt)</div>
    <div style="overflow:auto; max-height:150px; border:1px solid #2a3445; border-radius:8px; margin-top:4px;">
      <table id="heatmapTable" style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:4px;">Domain</th>
            <th style="text-align:right; padding:4px;">RB%</th>
            <th style="text-align:right; padding:4px;">VAL%</th>
            <th style="text-align:right; padding:4px;">BLK%</th>
            <th style="text-align:right; padding:4px;">OV%</th>
            <th style="text-align:left; padding:4px;">Top Rule</th>
          </tr>
        </thead>
        <tbody id="heatmapBody"></tbody>
      </table>
    </div>
    <div class="health-badge learning advanced-only" id="modelHealth">Model health: learning</div>
    <div class="health-badge learning advanced-only" id="cloudCost">Cloud cost: unknown</div>

    </div>

    <div class="section advanced-only">
      <label>Codex Presets</label>
      <div class="preset-grid">
        <button class="preset" id="presetReview">Review rigoroso</button>
        <button class="preset" id="presetFix">Corrigir bug</button>
        <button class="preset" id="presetRefactor">Refactor seguro</button>
        <button class="preset" id="presetTests">Gerar testes</button>
        <button class="preset" id="presetSecurity">Security review</button>
        <button class="preset" id="presetInfra">DevOps PowerShell</button>
        <button class="preset" id="presetClearSystem">Limpar system</button>
      </div>
      <div class="hint">Presets ajustam mode/action/context/temperature e estilo de resposta.</div>
    </div>

    <div class="section advanced-only">
      <label>Quick Prompts</label>
      <div class="chips" id="quickPrompts"></div>
      <div class="hint">Um clique para iniciar tarefas comuns.</div>
    </div>

    <div class="section advanced-only">
      <label>Setup Rapido</label>
      <div class="row">
        <button id="setupLocal">Usar Local</button>
        <button id="setupCloud" class="primary">Conectar Cloud</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button id="setupPickLocalModel">Escolher Modelo Local</button>
        <button id="setupTestLocal">Testar Ollama Local</button>
      </div>
      <div class="small" id="localRuntimeStatus">Local: verificando...</div>
      <div class="hint" id="setupState">Escolha Local para uso imediato, ou Cloud para login + token.</div>
    </div>

    <div class="section advanced-only">
      <label>Provider (Endpoint)</label>
      <div class="row">
        <button id="endpointLocal" class="seg">Local</button>
        <button id="endpointCloud" class="seg">Cloud</button>
      </div>
      <div class="hint" id="endpointHint">Escolha Local para uso offline ou Cloud para ollama.com.</div>
      <div class="cloud-panel hidden" id="cloudPanel">
        <div class="small" id="cloudTokenStatus">Cloud token: not configured</div>
        <div class="row" style="margin-top:8px;">
          <button id="cloudLogin">Conectar Cloud</button>
          <button id="cloudToken" class="primary">Set Token</button>
        </div>
      </div>

      <label style="margin-top:8px;" class="advanced-only">Advanced Endpoint</label>
      <select id="endpoint"></select>

      <label>Model</label>
      <select id="model"></select>

      <div class="row advanced-only" style="margin-top:8px;">
        <button id="refreshModels">Refresh</button>
        <button id="stop" class="danger">Stop</button>
      </div>
    </div>

    <div class="section">
      <label>Modelo</label>
      <input id="modelQuick" list="modelQuickList" placeholder="Digite para filtrar modelos"/>
      <datalist id="modelQuickList"></datalist>
      <div class="hint">Combobox com busca (type-to-filter). Funciona no modo simples e avancado.</div>
    </div>

    <div class="section hidden" id="cloudChoiceWrap">
      <label>Cloud</label>
      <div class="row">
        <input id="cloudChoice" list="cloudChoiceList" placeholder="Digite para filtrar clouds"/>
        <datalist id="cloudChoiceList"></datalist>
      </div>
      <div class="hint" id="cloudChoiceHint">Selecione a cloud (combobox com busca), estilo GitHub.</div>
    </div>

    <div class="section advanced-only">
      <label>Mode</label>
      <div>
        <span class="pill active" data-mode="devds">Dev + DS</span>
        <span class="pill" data-mode="code">Dev</span>
        <span class="pill" data-mode="ds">Data Science</span>
        <span class="pill" data-mode="devops">DevOps</span>
        <span class="pill" data-mode="pbi">Power BI</span>
      </div>

      <label>Action</label>
      <div id="actions"></div>
      <div class="hint">Dica: "Action" muda o estilo do prompt (refactor/tests/security etc).</div>
    </div>

    <div class="section">
      <label>Context</label>
      <div>
        <span class="pill active" data-ctx="workspace">Workspace</span>
        <span class="pill" data-ctx="file">File</span>
        <span class="pill" data-ctx="selection">Selection</span>
        <span class="pill" data-ctx="off">Off</span>
      </div>
      <div class="hint">Workspace envia varios arquivos; File envia trecho ao redor do cursor; Selection envia so o selecionado.</div>
    </div>

    <div class="section advanced-only">
      <label>Temperature</label>
      <input id="temp" type="number" min="0" max="2" step="0.1" value="0.3"/>

      <label>System prompt (optional)</label>
      <textarea id="system" class="mono" placeholder="Codex style: pragmatic senior engineer, concise, actionable, findings-first on review."></textarea>
    </div>

    <div class="section">
      <div class="row">
        <button id="copyLast">Copy</button>
        <button id="applyLast">Apply</button>
        <button id="applyAndValidate">Apply + Validate</button>
        <button id="rollbackLastApply">Undo Apply</button>
        <button id="retryLast" class="advanced-only">Retry</button>
      </div>

      <div class="hint" id="applyPreviewHint" style="margin-top:8px; white-space: pre-wrap;"></div>

      <div class="row advanced-only" style="margin-top:8px;">
        <button id="clearChat">Clear</button>
        <button id="resetUi">Reset UI</button>
      </div>

      <div class="advanced-only">
        <label style="margin-top:10px;">Favorites</label>
        <input id="favSearch" placeholder="Search favorites"/>
        <div class="favorites" id="favorites"></div>
      </div>
    </div>
  </div>

  <div class="right">
    <div class="chat" id="chat"></div>
    <div class="composer">
      <textarea id="msg" placeholder="Enter = send | Shift+Enter = newline | Ctrl+Enter = send"></textarea>
      <button class="primary" id="send">Send</button>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  const DEFAULT = {
    activeEndpointId: "local",
    mode: "devds",
    action: null,
    ctx: "workspace",
    temperature: 0.3,
    system: "",
    showAdvanced: false
  };

  const CODEX_PROMPT = [
    "You are Codex, a pragmatic senior software engineer working inside VS Code Copilot chat.",
    "Primary goal: help the user ship working code changes safely.",
    "Operating flow:",
    "- Understand request and constraints quickly.",
    "- Propose the smallest safe change that solves it.",
    "- Provide concrete code changes and validation steps.",
    "Behavior rules:",
    "- Be direct and concise. Avoid fluff.",
    "- Avoid cheerleading or motivational language.",
    "- If the request is ambiguous, ask at most one short clarifying question.",
    "- If user asks for a review, present findings first, ordered by severity, with file/line references when possible.",
    "- If user asks to implement/fix, provide actionable steps and concrete code.",
    "- Start with the solution/result, then only the essential context.",
    "- State assumptions, risks, and tradeoffs explicitly.",
    "- Keep responses practical and focused on the requested outcome.",
    "- Default response structure for engineering tasks: Result, Changes, Validation.",
    "Output rules:",
    "- Match the user's language.",
    "- Use short Markdown sections only when helpful.",
  ].join("\\n");

  const state = {
    endpoints: [],
    models: [],
    activeEndpointId: DEFAULT.activeEndpointId,
    mode: DEFAULT.mode,
    action: DEFAULT.action,
    ctx: DEFAULT.ctx,
    temperature: DEFAULT.temperature,
    system: DEFAULT.system,
    hasCloudKey: false,
    localOnline: false,
    localModelCount: 0,
    autoLane: "other",
    flags: { useSelection: false, useFile: false, useWorkspace: true },
    showAdvanced: DEFAULT.showAdvanced
  };

  const ACTIONS = {
    code: [
      ["explain","Explain"],
      ["refactor","Refactor"],
      ["tests","Tests"],
      ["fix","Fix"],
      ["review","Review"],
      ["security","Security"]
    ],
    ds: [
      ["eda","EDA"],
      ["sql","SQL/Pandas"],
      ["features","Features"],
      ["train_eval","Train/Eval"],
      ["debug","Debug"],
      ["doc","Doc"]
    ],
    devds: [
      ["review","Review"],
      ["fix","Fix"],
      ["refactor","Refactor"],
      ["tests","Tests"],
      ["debug","Debug"],
      ["eda","EDA"],
      ["sql","SQL/Pandas"],
      ["features","Features"],
      ["train_eval","Train/Eval"],
      ["security","Security"],
      ["doc","Doc"]
    ],
    devops: [
      ["infra_ps","PowerShell"],
      ["infra_ci","CI/CD"],
      ["infra_iac","IaC"],
      ["infra_obs","Observability"],
      ["infra_secops","SecOps"],
      ["infra_runbook","Runbook"],
      ["debug","Debug"],
      ["security","Security"],
      ["doc","Doc"]
    ],
    infra: [
      ["infra_ps","PowerShell"],
      ["infra_ci","CI/CD"],
      ["infra_iac","IaC"],
      ["infra_obs","Observability"],
      ["infra_secops","SecOps"],
      ["infra_runbook","Runbook"],
      ["debug","Debug"],
      ["security","Security"],
      ["doc","Doc"]
    ],
    pbi: [
      ["pbi_model","Model"],
      ["pbi_m","PowerQuery(M)"],
      ["pbi_dax","DAX"],
      ["pbi_visuals","Visuals"],
      ["pbi_checks","Checks"]
    ]
  };

  const $ = (id) => document.getElementById(id);
  const chat = $("chat");
  const statusEl = $("status");
  const metaEl = $("meta");
  const metricsEl = $("metrics");
  const heatmapEl = $("heatmap");
  const heatmapBodyEl = $("heatmapBody");
  const modelHealthEl = $("modelHealth");
  const cloudCostEl = $("cloudCost");
  const toggleAdvancedBtn = $("toggleAdvanced");
  const endpointSel = $("endpoint");
  const endpointLocalBtn = $("endpointLocal");
  const endpointCloudBtn = $("endpointCloud");
  const endpointHintEl = $("endpointHint");
  const cloudPanelEl = $("cloudPanel");
  const cloudTokenStatusEl = $("cloudTokenStatus");
  const cloudLoginBtn = $("cloudLogin");
  const cloudTokenBtn = $("cloudToken");
  const setupLocalBtn = $("setupLocal");
  const setupCloudBtn = $("setupCloud");
  const setupPickLocalModelBtn = $("setupPickLocalModel");
  const setupTestLocalBtn = $("setupTestLocal");
  const localRuntimeStatusEl = $("localRuntimeStatus");
  const setupStateEl = $("setupState");
  const modelSel = $("model");
  const modelQuickInput = $("modelQuick");
  const modelQuickList = $("modelQuickList");
  const cloudChoiceWrapEl = $("cloudChoiceWrap");
  const cloudChoiceInput = $("cloudChoice");
  const cloudChoiceList = $("cloudChoiceList");
  const cloudChoiceHintEl = $("cloudChoiceHint");
  const applyPreviewHintEl = $("applyPreviewHint");
  const tempEl = $("temp");
  const systemEl = $("system");
  const msgEl = $("msg");
  const favSearchEl = $("favSearch");
  const favoritesEl = $("favorites");
  const quickPromptsEl = $("quickPrompts");
  const MAX_CHAT_MESSAGES = 200;
  const aiBuffers = new Map();
  const aiNodes = new Map();
  let lastRequest = null;
  let activeAssistantId = null;
  let isBusy = false;
  let busySinceMs = 0;
  let busyTimer = null;
  let busyUiInitialized = false;
  let favorites = [];
  let chatHistory = [];

  const QUICK_PROMPTS = [
    "Review this code and list high/medium/low findings.",
    "Fix this bug and show the minimal patch.",
    "Generate tests for this file and edge cases.",
    "Create a PowerShell runbook with rollback steps.",
    "Explain this code in plain language for onboarding.",
    "Suggest performance improvements with low risk.",
  ];

  function loadPersisted(){
    const persisted = vscode.getState() || {};
    for(const k of Object.keys(DEFAULT)){
      if(persisted[k] !== undefined) state[k] = persisted[k];
    }
    // derive flags from ctx
    setCtx(state.ctx, true);
    tempEl.value = String(state.temperature ?? DEFAULT.temperature);
    systemEl.value = String(state.system ?? "");
    favorites = Array.isArray(persisted.favorites) ? persisted.favorites : [];
    chatHistory = Array.isArray(persisted.chatHistory) ? persisted.chatHistory.slice(-MAX_CHAT_MESSAGES) : [];
    restoreChatHistory();
    setAdvanced(state.showAdvanced, true);
  }

  function persist(){
    vscode.setState({
      activeEndpointId: state.activeEndpointId,
      mode: state.mode,
      action: state.action,
      ctx: state.ctx,
      temperature: Number(tempEl.value || "0.3"),
      system: systemEl.value || "",
      showAdvanced: !!state.showAdvanced,
      favorites,
      chatHistory
    });
  }

  function setAdvanced(visible, silent){
    state.showAdvanced = !!visible;
    document.querySelectorAll(".advanced-only").forEach((el) => {
      el.classList.toggle("hidden", !state.showAdvanced);
    });
    toggleAdvancedBtn.textContent = state.showAdvanced ? "Simples" : "Avancado";
    if(!silent) persist();
  }

  function renderQuickPrompts(){
    quickPromptsEl.innerHTML = "";
    for(const text of QUICK_PROMPTS){
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = text.length > 32 ? text.slice(0, 32) + "..." : text;
      chip.title = text;
      chip.addEventListener("click", () => {
        msgEl.value = text;
        msgEl.focus();
      });
      quickPromptsEl.appendChild(chip);
    }
  }

  function renderFavorites(){
    const q = String(favSearchEl?.value || "").toLowerCase();
    favoritesEl.innerHTML = "";
    const list = favorites
      .filter((f) => !q || String(f.text || "").toLowerCase().includes(q))
      .slice(0, 200);

    if(!list.length){
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "No favorites yet.";
      favoritesEl.appendChild(empty);
      return;
    }

    for(const item of list){
      const el = document.createElement("div");
      el.className = "fav-item";
      el.textContent = item.text;
      el.title = "Click to reuse";
      el.addEventListener("click", () => {
        msgEl.value = item.text;
        msgEl.focus();
      });
      favoritesEl.appendChild(el);
    }
  }

  function addFavorite(text){
    const t = String(text || "").trim();
    if(!t) return;
    if(favorites.some((f) => f.text === t)) return;
    favorites.unshift({ text: t, ts: Date.now() });
    favorites = favorites.slice(0, 120);
    renderFavorites();
    persist();
    setStatus("Saved to favorites", "ok");
  }

  function renderHeatmapRows(rows){
    const list = Array.isArray(rows) ? rows : [];
    heatmapBodyEl.innerHTML = "";
    for(const row of list){
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.dataset.domain = String(row.domain || "");
      tr.innerHTML = [
        '<td style="padding:4px;">' + String(row.domain || "") + "</td>",
        '<td style="padding:4px; text-align:right;">' + Number(row.rollbackRate || 0) + "%</td>",
        '<td style="padding:4px; text-align:right;">' + Number(row.validateRate || 0) + "%</td>",
        '<td style="padding:4px; text-align:right;">' + Number(row.blockRate || 0) + "%</td>",
        '<td style="padding:4px; text-align:right;">' + Number(row.overrideRate || 0) + "%</td>",
        '<td style="padding:4px;">' + String(row.topRule || "-") + "</td>"
      ].join("");
      tr.addEventListener("click", () => {
        const domain = String(row.domain || "").trim();
        if(!domain) return;
        msgEl.value = 'Analyze governance for domain "' + domain + '" and propose policy tuning based on rollback/validation trends.';
        msgEl.focus();
      });
      heatmapBodyEl.appendChild(tr);
    }
  }

  function setStatus(text, kind){
    const badge = kind === "err" ? "err" : "ok";
    statusEl.innerHTML = (kind ? '<span class="badge '+badge+'">'+(kind==="err"?"Error":"Ready")+'</span>' : '') + text;
  }

  function isNearBottom(){
    const delta = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    return delta < 96;
  }

  function trimChatHistory(){
    if(chatHistory.length > MAX_CHAT_MESSAGES){
      chatHistory = chatHistory.slice(-MAX_CHAT_MESSAGES);
    }
  }

  function upsertAssistantHistory(assistantId, text){
    for(let i = chatHistory.length - 1; i >= 0; i--){
      const item = chatHistory[i];
      if(item.role === "ai" && item.assistantId === assistantId){
        item.text = text;
        return;
      }
    }
    chatHistory.push({ role: "ai", assistantId, text });
    trimChatHistory();
  }

  function restoreChatHistory(){
    chat.innerHTML = "";
    aiBuffers.clear();
    aiNodes.clear();
    for(const item of chatHistory){
      const who = item.role === "me" ? "me" : "ai";
      const div = addMsg(String(item.text || ""), who, true);
      if(who === "ai" && item.assistantId){
        div.dataset.assistantId = item.assistantId;
        aiNodes.set(item.assistantId, div);
        aiBuffers.set(item.assistantId, String(item.text || ""));
      }
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function attachCodeCopyButtons(container){
    container.querySelectorAll("pre").forEach((pre) => {
      if(pre.querySelector(".code-copy")){
        return;
      }
      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.textContent = "Copy code";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const codeEl = pre.querySelector("code");
        const code = codeEl ? String(codeEl.textContent || "") : "";
        vscode.postMessage({ type: "copyText", text: code });
        setStatus("Code copied", "ok");
      });
      pre.appendChild(btn);
    });
  }

  function setBusy(busy){
    const next = !!busy;
    if(next === isBusy && busyUiInitialized){
      return;
    }
    busyUiInitialized = true;
    isBusy = next;
    $("send").disabled = isBusy;
    $("retryLast").disabled = isBusy || !lastRequest;
    $("stop").disabled = !isBusy;
    endpointSel.disabled = isBusy;
    endpointLocalBtn.disabled = isBusy;
    endpointCloudBtn.disabled = isBusy;
    setupLocalBtn.disabled = isBusy;
    setupCloudBtn.disabled = isBusy;
    setupPickLocalModelBtn.disabled = isBusy;
    setupTestLocalBtn.disabled = isBusy;
    modelSel.disabled = isBusy;
    $("refreshModels").disabled = isBusy;
    msgEl.disabled = isBusy;
    if(isBusy){
      busySinceMs = Date.now();
      if(busyTimer){
        clearInterval(busyTimer);
      }
      busyTimer = setInterval(() => {
        if(!isBusy){
          return;
        }
        const secs = Math.max(0, Math.floor((Date.now() - busySinceMs) / 1000));
        setStatus("Thinking... " + secs + "s", null);
      }, 1000);
      msgEl.placeholder = "Generating response... Click Stop to cancel.";
    } else {
      if(busyTimer){
        clearInterval(busyTimer);
        busyTimer = null;
      }
      busySinceMs = 0;
      msgEl.placeholder = "Enter = send | Shift+Enter = newline | Ctrl+Enter = send";
      msgEl.focus();
    }
  }

  function endpointLooksLocal(ep){
    const base = String(ep?.baseUrl || "").toLowerCase();
    const id = String(ep?.id || "").toLowerCase();
    const name = String(ep?.name || "").toLowerCase();
    return id === "local" || base.includes("localhost:11434") || name.includes("local");
  }

  function endpointLooksCloud(ep){
    const base = String(ep?.baseUrl || "").toLowerCase();
    const id = String(ep?.id || "").toLowerCase();
    const name = String(ep?.name || "").toLowerCase();
    return id === "cloud" || base.includes("ollama.com") || name.includes("cloud");
  }

  function findEndpointByKind(kind){
    if(kind === "local"){
      return state.endpoints.find((e) => endpointLooksLocal(e)) || state.endpoints[0] || null;
    }
    return state.endpoints.find((e) => endpointLooksCloud(e)) || null;
  }

  function getCloudEndpoints(){
    return state.endpoints.filter((e) => endpointLooksCloud(e));
  }

  function resolveCloudChoice(raw){
    const q = String(raw || "").trim().toLowerCase();
    if(!q){
      return null;
    }
    const clouds = getCloudEndpoints();
    const exact = clouds.find((e) => e.name.toLowerCase() === q || e.id.toLowerCase() === q);
    if(exact){
      return exact;
    }
    return clouds.find((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) || null;
  }

  function refreshCloudChoiceUi(){
    const clouds = getCloudEndpoints();
    const canShow = state.hasCloudKey && clouds.length > 0;
    cloudChoiceWrapEl.classList.toggle("hidden", !canShow);
    if(!canShow){
      return;
    }
    const previous = String(cloudChoiceInput.value || "").trim();
    cloudChoiceList.innerHTML = "";
    for(const ep of clouds){
      const opt = document.createElement("option");
      opt.value = ep.name;
      cloudChoiceList.appendChild(opt);
    }
    const activeCloud = clouds.find((e) => e.id === state.activeEndpointId)?.name;
    cloudChoiceInput.value = activeCloud || previous || clouds[0].name;
    cloudChoiceHintEl.textContent = "Escolha qual cloud usar para o chat apos o token.";
  }

  function setCloudTokenStatus(configured){
    state.hasCloudKey = !!configured;
    cloudTokenStatusEl.textContent = state.hasCloudKey ? "Cloud token: configured" : "Cloud token: not configured";
    cloudTokenStatusEl.style.color = state.hasCloudKey ? "#99f6e4" : "";
    updateSetupState();
    refreshCloudChoiceUi();
  }

  function setLocalRuntimeStatus(online, modelCount, error){
    state.localOnline = !!online;
    state.localModelCount = Number(modelCount || 0);
    if(state.localOnline){
      localRuntimeStatusEl.textContent = "Local: online | modelos: " + state.localModelCount;
      localRuntimeStatusEl.style.color = "#99f6e4";
      updateSetupState();
      return;
    }
    localRuntimeStatusEl.textContent = "Local: offline" + (error ? " | " + String(error) : "");
    localRuntimeStatusEl.style.color = "#fecaca";
    updateSetupState();
  }

  function updateSetupState(){
    const ep = state.endpoints.find((e) => e.id === state.activeEndpointId);
    const isCloud = endpointLooksCloud(ep);
    if (isCloud) {
      setupStateEl.textContent = state.hasCloudKey
        ? "Cloud ativo com token configurado."
        : "Cloud ativo sem token. O chat vai usar Local automaticamente.";
      return;
    }
    setupStateEl.textContent = state.localOnline
      ? "Local ativo e pronto para uso."
      : "Local selecionado, mas Ollama local parece offline.";
  }

  function syncEndpointUi(){
    const ep = state.endpoints.find((e) => e.id === state.activeEndpointId);
    const isCloud = endpointLooksCloud(ep);
    const isLocal = endpointLooksLocal(ep);

    endpointLocalBtn.classList.toggle("active", isLocal);
    endpointCloudBtn.classList.toggle("active", isCloud);
    cloudPanelEl.classList.toggle("hidden", !isCloud);
    endpointHintEl.textContent = isCloud
      ? "Cloud ativo: faca login e configure token para respostas no ollama.com."
      : "Local ativo: execucao offline no Ollama local.";
    updateSetupState();
  }

  function selectEndpoint(endpointId, refresh){
    if(!endpointId){
      return;
    }
    state.activeEndpointId = endpointId;
    endpointSel.value = endpointId;
    updateMeta();
    syncEndpointUi();
    refreshCloudChoiceUi();
    persist();
    vscode.postMessage({ type: "setActiveEndpoint", endpointId: state.activeEndpointId });
    if(refresh){
      setStatus("Loading models...", null);
      vscode.postMessage({ type: "refreshModels", endpointId: state.activeEndpointId });
    }
  }

  function updateMeta(){
    const ep = state.endpoints.find(e => e.id === state.activeEndpointId);
    const epName = ep ? ep.name : state.activeEndpointId;
    const selectedModel = resolveModelChoice(modelQuickInput.value) || modelSel.value || "-";
    if(!state.showAdvanced){
      const route = state.localOnline ? "local" : (state.hasCloudKey ? "cloud" : "local (fallback)");
      metaEl.textContent = "Modo: auto | Trilha: " + state.autoLane + " | Roteamento: " + route + " | Modelo: " + selectedModel;
      return;
    }
    metaEl.textContent = "Provider: " + epName +
      " | Model: " + selectedModel +
      " | Mode: " + state.mode +
      " | Action: " + (state.action || "none") +
      " | Context: " + state.ctx;
  }

  function chooseAutoEndpointId(){
    const local = findEndpointByKind("local");
    const cloud = findEndpointByKind("cloud");
    if(state.localOnline && local){
      return local.id;
    }
    if(state.hasCloudKey && cloud){
      return cloud.id;
    }
    if(local){
      return local.id;
    }
    return state.activeEndpointId;
  }

  function resolveModelChoice(raw){
    const q = String(raw || "").trim();
    if(!q){
      return "";
    }
    const exact = state.models.find((m) => m.toLowerCase() === q.toLowerCase());
    if(exact){
      return exact;
    }
    const partial = state.models.find((m) => m.toLowerCase().includes(q.toLowerCase()));
    return partial || q;
  }

  function inferAutoConfig(text){
    const t = String(text || "").toLowerCase();

    let lane = "other";
    if(/\\b(devops|infra|kubernetes|docker|helm|pipeline|ci\\/cd|terraform|iac|ansible|deploy|powershell|runbook|sre)\\b/.test(t)){
      lane = "devops";
    } else if(/\\b(pandas|sql|dataframe|dataset|eda|feature|treinar|train|modelo preditivo|machine learning|ml)\\b/.test(t)){
      lane = "ds";
    } else if(/\\b(codigo|code|bug|refactor|typescript|javascript|node|api|backend|frontend|react|teste|test|fun[cç][aã]o|classe)\\b/.test(t)){
      lane = "dev";
    }
    if(/\\b(power bi|dax|power query|\\bm\\b|pbix|medida|relatorio)\\b/.test(t)){
      lane = "other";
    }

    const mode = lane === "dev" ? "code" : lane === "ds" ? "ds" : lane === "devops" ? "devops" : "devds";

    let action = null;
    if(mode === "code"){
      if(/\\b(security|seguran[cç]a|vulnerab|owasp)\\b/.test(t)) action = "security";
      else if(/\\b(review|code review|auditar|analisa|analisar riscos?)\\b/.test(t)) action = "review";
      else if(/\\b(fix|bug|erro|quebra|corrig|consert)\\b/.test(t)) action = "fix";
      else if(/\\b(test|teste|unit|integra[cç][aã]o|coverage)\\b/.test(t)) action = "tests";
      else if(/\\b(refactor|refator|clean up|melhorar estrutura)\\b/.test(t)) action = "refactor";
      else if(/\\b(explain|explica|entender|como funciona)\\b/.test(t)) action = "explain";
    } else if(mode === "ds"){
      if(/\\b(sql|query|join|cte)\\b/.test(t)) action = "sql";
      else if(/\\b(eda|explorat|analise exploratoria)\\b/.test(t)) action = "eda";
      else if(/\\b(feature|variavel|engenharia de atributos)\\b/.test(t)) action = "features";
      else if(/\\b(train|trein|eval|avaliar|metric)\\b/.test(t)) action = "train_eval";
      else if(/\\b(debug|erro|falha|corrig)\\b/.test(t)) action = "debug";
      else if(/\\b(doc|documenta)\\b/.test(t)) action = "doc";
    } else if(mode === "devops"){
      if(/\\b(ci|cd|pipeline|github actions|gitlab ci|azure devops)\\b/.test(t)) action = "infra_ci";
      else if(/\\b(terraform|iac|bicep|cloudformation|pulumi)\\b/.test(t)) action = "infra_iac";
      else if(/\\b(observability|observab|prometheus|grafana|alerta|log)\\b/.test(t)) action = "infra_obs";
      else if(/\\b(secops|security|seguran[cç]a|hardening|vulnerab|siem)\\b/.test(t)) action = "infra_secops";
      else if(/\\b(runbook|procedimento|opera[cç][aã]o|incidente)\\b/.test(t)) action = "infra_runbook";
      else action = "infra_ps";
    } else if(mode === "pbi"){
      if(/\\b(dax|medida|measure|calculated column)\\b/.test(t)) action = "pbi_dax";
      else if(/\\b(power query|\\bm\\b|query editor|transforma[cç][aã]o)\\b/.test(t)) action = "pbi_m";
      else if(/\\b(model|modelo|star schema|relacionamento)\\b/.test(t)) action = "pbi_model";
      else if(/\\b(visual|grafico|dashboard)\\b/.test(t)) action = "pbi_visuals";
      else action = "pbi_checks";
    }

    let temperature = 0.3;
    if(action === "review" || action === "security"){
      temperature = 0.15;
    } else if(action === "fix" || action === "tests" || action === "refactor"){
      temperature = 0.2;
    }

    return {
      lane,
      mode,
      action,
      temperature,
      flags: { useSelection: false, useFile: false, useWorkspace: true },
      ctx: "workspace"
    };
  }

  function setModelHealth(text){
    const t = String(text || "Model health: learning");
    modelHealthEl.textContent = t;
    modelHealthEl.classList.remove("excellent", "good", "fair", "learning");
    const lower = t.toLowerCase();
    if(lower.includes("excellent")){
      modelHealthEl.classList.add("excellent");
      return;
    }
    if(lower.includes("good")){
      modelHealthEl.classList.add("good");
      return;
    }
    if(lower.includes("fair")){
      modelHealthEl.classList.add("fair");
      return;
    }
    modelHealthEl.classList.add("learning");
  }

  function setCloudCost(text){
    const t = String(text || "Cloud cost: unknown");
    cloudCostEl.textContent = t;
    cloudCostEl.classList.remove("excellent", "good", "fair", "learning");
    const lower = t.toLowerCase();
    if(lower.includes("low")){
      cloudCostEl.classList.add("excellent");
      return;
    }
    if(lower.includes("medium")){
      cloudCostEl.classList.add("good");
      return;
    }
    if(lower.includes("high")){
      cloudCostEl.classList.add("fair");
      return;
    }
    cloudCostEl.classList.add("learning");
  }

  function escapeHtml(text){
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMarkdown(text){
    let html = escapeHtml(text || "");
    const bt = String.fromCharCode(96);
    html = html.replace(new RegExp(bt + bt + bt + "([\\\\s\\\\S]*?)" + bt + bt + bt, "g"), (_m, code) => "<pre><code>" + highlightCode(code) + "</code></pre>");
    html = html.replace(new RegExp(bt + "([^" + bt + "\\\\n]+)" + bt, "g"), "<code>$1</code>");
    html = html.replace(/^### (.*)$/gm, "<p><strong>$1</strong></p>");
    html = html.replace(/^## (.*)$/gm, "<p><strong>$1</strong></p>");
    html = html.replace(/^# (.*)$/gm, "<p><strong>$1</strong></p>");
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, "<strong>$1</strong>");
    html = html.replace(/\\*(.*?)\\*/g, "<em>$1</em>");
    html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2">$1</a>');
    html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\\s\\S]*?<\\/li>)/g, "<ul>$1</ul>");
    html = html.replace(/<\\/ul>\\s*<ul>/g, "");
    html = html.replace(/\\n\\n+/g, "</p><p>");
    html = "<p>" + html + "</p>";
    html = html.replace(/<p><\\/p>/g, "");
    return html;
  }

  function highlightCode(code){
    const keywords = [
      "const","let","var","function","return","if","else","for","while","switch","case",
      "class","async","await","try","catch","finally","import","from","export","new",
      "public","private","protected","static","interface","type","extends","implements"
    ];
    const re = new RegExp("\\\\b(" + keywords.join("|") + ")\\\\b", "g");
    return String(code).replace(re, '<span class="kw">$1</span>');
  }

  function addMessageActions(el, text, who){
    if(who !== "ai") return;
    const wrap = document.createElement("div");
    wrap.className = "msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "copyText", text: text || "" });
    });

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "applyText", text: text || "" });
    });

    wrap.appendChild(copyBtn);
    wrap.appendChild(applyBtn);

    const favBtn = document.createElement("button");
    favBtn.textContent = "Favorite";
    favBtn.addEventListener("click", () => addFavorite(text));
    wrap.appendChild(favBtn);

    const reuseBtn = document.createElement("button");
    reuseBtn.textContent = "Reuse";
    reuseBtn.addEventListener("click", () => {
      msgEl.value = String(text || "");
      msgEl.focus();
    });
    wrap.appendChild(reuseBtn);

    el.appendChild(wrap);
  }

  function setMsgContent(el, text, who){
    if(who === "ai"){
      el.innerHTML = renderMarkdown(text);
      addMessageActions(el, text, who);
      attachCodeCopyButtons(el);
    } else {
      el.textContent = text;
    }
  }

  function addMsg(text, who, skipHistory){
    const stickToBottom = isNearBottom() || who === "me";
    const div = document.createElement("div");
    div.className = "msg " + (who === "me" ? "me" : "ai");
    setMsgContent(div, text, who);
    chat.appendChild(div);
    if(stickToBottom){
      chat.scrollTop = chat.scrollHeight;
    }
    if(!skipHistory){
      chatHistory.push({ role: who, text: String(text || "") });
      trimChatHistory();
      persist();
    }
    return div;
  }

  function fillEndpoints(){
    endpointSel.innerHTML = "";
    for(const ep of state.endpoints){
      const opt = document.createElement("option");
      opt.value = ep.id;
      opt.textContent = ep.name;
      endpointSel.appendChild(opt);
    }
    const fallbackId = state.endpoints[0]?.id || "local";
    if(!state.endpoints.some((e) => e.id === state.activeEndpointId)){
      state.activeEndpointId = fallbackId;
    }
    endpointSel.value = state.activeEndpointId || fallbackId;
    syncEndpointUi();
    refreshCloudChoiceUi();
  }

  function fillModels(models){
    state.models = models || [];
    const previous = resolveModelChoice(modelQuickInput.value) || modelSel.value;
    modelSel.innerHTML = "";
    modelQuickList.innerHTML = "";
    for(const m of state.models){
      const optA = document.createElement("option");
      optA.value = m;
      optA.textContent = m;
      modelSel.appendChild(optA);
      const optB = document.createElement("option");
      optB.value = m;
      modelQuickList.appendChild(optB);
    }
    if(state.models.length){
      const keep = previous && state.models.includes(previous) ? previous : state.models[0];
      modelSel.value = keep;
      modelQuickInput.value = keep;
    }
    updateMeta();
  }

  function renderActions(){
    const wrap = $("actions");
    wrap.innerHTML = "";
    const items = ACTIONS[state.mode] || [];
    for(const [key,label] of items){
      const el = document.createElement("span");
      el.className = "pill " + (state.action === key ? "active" : "");
      el.textContent = label;
      el.dataset.action = key;
      el.addEventListener("click", () => {
        state.action = (state.action === key) ? null : key;
        renderActions();
        updateMeta();
        persist();
      });
      wrap.appendChild(el);
    }
  }

  function setMode(mode, silent){
    state.mode = mode;
    document.querySelectorAll(".pill[data-mode]").forEach(p => {
      p.classList.toggle("active", p.dataset.mode === mode);
    });
    // reset action when mode changes
    state.action = null;
    renderActions();
    updateMeta();
    if(!silent) persist();
  }

  function setCtx(ctx, silent){
    state.ctx = ctx;
    document.querySelectorAll(".pill[data-ctx]").forEach(p => {
      p.classList.toggle("active", p.dataset.ctx === ctx);
    });
    state.flags.useFile = ctx === "file";
    state.flags.useSelection = ctx === "selection";
    state.flags.useWorkspace = ctx === "workspace";
    updateMeta();
    if(!silent) persist();
  }

  function applyPreset(p){
    setMode("devds", true);
    state.system = CODEX_PROMPT;
    systemEl.value = CODEX_PROMPT;

    if(p === "review"){
      state.action = "review";
      setCtx("file", true);
      tempEl.value = "0.2";
    } else if(p === "fix"){
      state.action = "fix";
      setCtx("selection", true);
      tempEl.value = "0.2";
    } else if(p === "refactor"){
      state.action = "refactor";
      setCtx("file", true);
      tempEl.value = "0.2";
    } else if(p === "tests"){
      state.action = "tests";
      setCtx("selection", true);
      tempEl.value = "0.2";
    } else if(p === "security"){
      state.action = "security";
      setCtx("file", true);
      tempEl.value = "0.1";
    } else if(p === "infra"){
      setMode("devops", true);
      state.action = "infra_ps";
      setCtx("file", true);
      tempEl.value = "0.2";
    }

    renderActions();
    updateMeta();
    persist();
    setStatus("Preset aplicado OK", "ok");
  }

  // Enter sends, Shift+Enter newline, Ctrl+Enter sends
  msgEl.addEventListener("keydown", (e) => {
    if((e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && e.ctrlKey)){
      e.preventDefault();
      $("send").click();
    }
  });

  window.addEventListener("keydown", (e) => {
    if(e.ctrlKey && e.key.toLowerCase() === "k"){
      e.preventDefault();
      msgEl.focus();
    }
    if(e.ctrlKey && e.key.toLowerCase() === "l"){
      e.preventDefault();
      $("clearChat").click();
    }
  });

  document.querySelectorAll(".pill[data-mode]").forEach(p => p.addEventListener("click", () => setMode(p.dataset.mode)));
  document.querySelectorAll(".pill[data-ctx]").forEach(p => p.addEventListener("click", () => setCtx(p.dataset.ctx)));
  toggleAdvancedBtn.addEventListener("click", () => setAdvanced(!state.showAdvanced, false));

  endpointSel.addEventListener("change", () => {
    selectEndpoint(endpointSel.value, true);
  });
  modelSel.addEventListener("change", () => {
    modelQuickInput.value = modelSel.value;
    updateMeta();
    persist();
  });
  modelQuickInput.addEventListener("change", () => {
    const picked = resolveModelChoice(modelQuickInput.value);
    if(picked){
      modelQuickInput.value = picked;
      modelSel.value = picked;
    }
    updateMeta();
    persist();
  });
  modelQuickInput.addEventListener("input", () => {
    const picked = resolveModelChoice(modelQuickInput.value);
    if(picked && state.models.includes(picked)){
      modelSel.value = picked;
    }
    updateMeta();
  });

  setupLocalBtn.addEventListener("click", () => {
    const local = findEndpointByKind("local");
    if(!local){
      setStatus("No local endpoint configured", "err");
      return;
    }
    selectEndpoint(local.id, true);
  });

  setupCloudBtn.addEventListener("click", () => {
    const cloud = findEndpointByKind("cloud");
    if(!cloud){
      setStatus("No cloud endpoint configured", "err");
      return;
    }
    selectEndpoint(cloud.id, true);
    vscode.postMessage({ type: "openCloudLogin" });
    setStatus("Opening guided cloud setup...", null);
  });
  cloudChoiceInput.addEventListener("change", () => {
    const chosen = resolveCloudChoice(cloudChoiceInput.value);
    if(!chosen){
      return;
    }
    cloudChoiceInput.value = chosen.name;
    selectEndpoint(chosen.id, true);
    setStatus("Cloud selecionada.", "ok");
  });

  setupPickLocalModelBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "chooseLocalModel" });
    setStatus("Opening local model picker...", null);
  });

  setupTestLocalBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "testLocalConnection" });
    setStatus("Testing local Ollama...", null);
  });

  endpointLocalBtn.addEventListener("click", () => {
    const local = findEndpointByKind("local");
    if(!local){
      setStatus("No local endpoint configured", "err");
      return;
    }
    selectEndpoint(local.id, true);
  });

  endpointCloudBtn.addEventListener("click", () => {
    const cloud = findEndpointByKind("cloud");
    if(!cloud){
      setStatus("No cloud endpoint configured", "err");
      return;
    }
    selectEndpoint(cloud.id, true);
  });

  cloudLoginBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "openCloudLogin" });
    setStatus("Opening guided cloud setup...", null);
  });

  cloudTokenBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "openCloudToken" });
    setStatus("Opening token input...", null);
  });

  $("refreshModels").addEventListener("click", () => {
    setStatus("Refreshing models...", null);
    vscode.postMessage({ type: "refreshModels", endpointId: state.activeEndpointId });
  });

  $("stop").addEventListener("click", () => {
    if(!isBusy){
      return;
    }
    setStatus("Stopping...", null);
    vscode.postMessage({ type: "stop" });
  });
  $("copyLast").addEventListener("click", () => vscode.postMessage({ type: "copyLast" }));
  $("applyLast").addEventListener("click", () => vscode.postMessage({ type: "applyLast" }));
  $("applyAndValidate").addEventListener("click", () => vscode.postMessage({ type: "applyAndValidate" }));
  $("rollbackLastApply").addEventListener("click", () => vscode.postMessage({ type: "rollbackLastApply" }));
  $("retryLast").addEventListener("click", () => {
    if(!lastRequest || isBusy) return;
    const assistantId = String(Date.now());
    activeAssistantId = assistantId;
    setStatus("Retrying...", null);
    setBusy(true);
    const payload = { ...lastRequest, assistantId };
    addMsg(lastRequest.text, "me");
    upsertAssistantHistory(assistantId, "");
    aiBuffers.set(assistantId, "");
    aiNodes.delete(assistantId);
    vscode.postMessage(payload);
  });
  $("presetReview").addEventListener("click", () => applyPreset("review"));
  $("presetFix").addEventListener("click", () => applyPreset("fix"));
  $("presetRefactor").addEventListener("click", () => applyPreset("refactor"));
  $("presetTests").addEventListener("click", () => applyPreset("tests"));
  $("presetSecurity").addEventListener("click", () => applyPreset("security"));
  $("presetInfra").addEventListener("click", () => applyPreset("infra"));
  favSearchEl.addEventListener("input", () => renderFavorites());
  $("presetClearSystem").addEventListener("click", () => {
    systemEl.value = "";
    state.system = "";
    persist();
    setStatus("System prompt limpo OK", "ok");
  });

  $("clearChat").addEventListener("click", () => {
    chat.innerHTML = "";
    aiBuffers.clear();
    aiNodes.clear();
    chatHistory = [];
    activeAssistantId = null;
    setBusy(false);
    persist();
  });

  $("resetUi").addEventListener("click", () => {
    const local = findEndpointByKind("local");
    state.activeEndpointId = local?.id || DEFAULT.activeEndpointId;
    setMode(DEFAULT.mode, true);
    setCtx(DEFAULT.ctx, true);
    state.action = DEFAULT.action;
    tempEl.value = String(DEFAULT.temperature);
    systemEl.value = DEFAULT.system;
    setAdvanced(DEFAULT.showAdvanced, true);
    renderActions();
    fillEndpoints();
    updateMeta();
    persist();
    setStatus("UI reset OK", "ok");
  });

  function buildSendPayload(assistantId, text){
    const auto = !state.showAdvanced ? inferAutoConfig(text) : null;
    if(auto){
      state.autoLane = auto.lane;
    }
    const endpointId = auto ? chooseAutoEndpointId() : state.activeEndpointId;
    const selectedModel = resolveModelChoice(modelQuickInput.value) || modelSel.value || undefined;
    return {
      type: "send",
      assistantId,
      endpointId,
      model: selectedModel,
      temperature: auto ? auto.temperature : Number(tempEl.value || "0.3"),
      systemPrompt: state.showAdvanced ? systemEl.value : CODEX_PROMPT,
      mode: auto ? auto.mode : state.mode,
      action: auto ? auto.action : state.action,
      text,
      flags: auto ? auto.flags : state.flags
    };
  }

  $("send").addEventListener("click", () => {
    if(isBusy) return;
    const text = (msgEl.value || "").trim();
    if(!text) return;

    addMsg(text, "me");
    msgEl.value = "";

    const assistantId = String(Date.now());
    activeAssistantId = assistantId;
    aiBuffers.set(assistantId, "");
    upsertAssistantHistory(assistantId, "");
    aiNodes.delete(assistantId);
    const autoCfg = !state.showAdvanced ? inferAutoConfig(text) : null;
    const payload = buildSendPayload(assistantId, text);
    const autoInfo = !state.showAdvanced
      ? "Thinking | " + autoCfg.lane + " | " + payload.mode + "/" + (payload.action || "none")
      : "Thinking...";
    setStatus(autoInfo, null);
    setBusy(true);
    lastRequest = payload;
    vscode.postMessage(payload);

    persist();
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;

    if(msg.type === "init"){
      state.endpoints = msg.endpoints || [];
      state.activeEndpointId = msg.activeEndpointId || state.activeEndpointId || "local";
      state.hasCloudKey = !!msg.hasCloudKey;
      fillEndpoints();
      fillModels(msg.models || []);
      setCloudTokenStatus(state.hasCloudKey);
      renderActions();
      updateMeta();
      setStatus("Ready", "ok");
      setBusy(false);
      return;
    }

    if(msg.type === "models"){
      if(msg.endpointId === state.activeEndpointId){
        fillModels(msg.models || []);
        setStatus("Models loaded", "ok");
        setBusy(false);
      }
      return;
    }

    if(msg.type === "activeEndpoint"){
      selectEndpoint(String(msg.endpointId || ""), false);
      return;
    }

    if(msg.type === "cloudKeyStatus"){
      setCloudTokenStatus(!!msg.configured);
      setStatus(msg.configured ? "Cloud token configured" : "Cloud token not configured", msg.configured ? "ok" : null);
      return;
    }

    if(msg.type === "localStatus"){
      setLocalRuntimeStatus(!!msg.online, Number(msg.modelCount || 0), msg.error || "");
      setStatus(msg.online ? "Local Ollama available" : "Local Ollama unavailable", msg.online ? "ok" : "err");
      return;
    }

    if(msg.type === "token"){
      const stickToBottom = isNearBottom();
      let node = aiNodes.get(msg.assistantId);
      if(!node){
        const div = document.createElement("div");
        div.className = "msg ai";
        div.dataset.assistantId = msg.assistantId;
        setMsgContent(div, "", "ai");
        chat.appendChild(div);
        node = div;
        aiNodes.set(msg.assistantId, div);
      }
      const current = aiBuffers.get(msg.assistantId) || "";
      const next = current + msg.token;
      aiBuffers.set(msg.assistantId, next);
      upsertAssistantHistory(msg.assistantId, next);
      setMsgContent(node, next, "ai");
      if(stickToBottom){
        chat.scrollTop = chat.scrollHeight;
      }
      return;
    }

    if(msg.type === "done"){
      if(!msg.assistantId || msg.assistantId === activeAssistantId){
        activeAssistantId = null;
        setBusy(false);
      }
      if(msg.assistantId){
        aiBuffers.delete(msg.assistantId);
      }
      persist();
      setStatus("Ready", "ok");
      updateMeta();
      return;
    }

    if(msg.type === "error"){
      addMsg("Error: " + msg.error, "ai");
      if(!msg.assistantId || msg.assistantId === activeAssistantId){
        activeAssistantId = null;
        setBusy(false);
      }
      setStatus("Error", "err");
      return;
    }

    if(msg.type === "info"){
      const info = String(msg.message || "Info");
      if(info.toLowerCase().startsWith("model health:")){
        setModelHealth(info);
        return;
      }
      if(info.toLowerCase().startsWith("estimated cloud cost:")){
        setCloudCost(info.replace(/^estimated\s+/i, ""));
        return;
      }
      addMsg("Info: " + info, "ai");
      if(msg.assistantId){
        setStatus(info, null);
      } else {
        setStatus(info, "ok");
      }
      return;
    }

    if(msg.type === "applyPreview"){
      applyPreviewHintEl.textContent = String(msg.markdown || "");
      return;
    }

    if(msg.type === "metrics"){
      metricsEl.textContent = String(msg.summary || "Perf | avg: - | validate: - | rollback: -");
      return;
    }

    if(msg.type === "heatmapRows"){
      renderHeatmapRows(msg.rows || []);
      return;
    }

    if(msg.type === "heatmap"){
      heatmapEl.textContent = String(msg.markdown || "Heatmap | unavailable");
      return;
    }
  });

  // init
  loadPersisted();
  renderQuickPrompts();
  setMode(state.mode, true);
  renderActions();
  renderFavorites();
  updateMeta();
  setModelHealth("Model health: learning");
  setCloudCost("Cloud cost: unknown");
  setCloudTokenStatus(false);
  syncEndpointUi();
  setBusy(false);
  vscode.postMessage({ type: "init" });
</script>
</body>
</html>`;
}

