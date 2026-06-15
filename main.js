/*
THIS IS A GENERATED/COMPILED FILE AND NOT THE SOURCE.
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DailyConditionTracker
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  dailyNotesFolder: "",
  conditionSectionHeader: "\uCEE8\uB514\uC158"
};
var TRACKER_VIEW_TYPE = "daily-condition-tracker";
var POS2 = ["\uCD5C\uACE0\uB2E4", "\uC644\uBCBD\uD558", "\uB108\uBB34\uC88B", "\uC5C4\uCCAD\uC88B", "\uAE30\uBD84\uCD5C\uACE0", "\uCEE8\uB514\uC158\uCD5C\uACE0", "\uCD5C\uC0C1\uC774"];
var POS1 = [
  "\uC88B\uB2E4",
  "\uC88B\uC544",
  "\uC88B\uC74C",
  "\uC88B\uC558",
  "\uD65C\uAE30",
  "\uC0C1\uCF8C",
  "\uAE30\uBD84\uC88B",
  "\uC5D0\uB108\uC9C0",
  "\uC990\uAC81",
  "\uD589\uBCF5",
  "\uC798\uB410",
  "\uD3B8\uC548",
  "\uCDA9\uBD84",
  "\uAD1C\uCC2E",
  "\uC0B0\uB73B",
  "\uAC1C\uC6B4",
  "\uC798\uC7A4",
  "\uC798\uBA39",
  "\uD798\uC788",
  "\uD65C\uBC1C",
  "\uC218\uC6D4",
  "\uAC00\uBFD0",
  "\uC758\uC695",
  "\uC9D1\uC911\uC798",
  "\uBFCC\uB4EF",
  "\uD65C\uB825",
  "\uC5F4\uC815",
  "\uC0DD\uC0B0\uC801",
  "\uD65C\uB3D9\uC801"
];
var NEG2 = ["\uCD5C\uC545", "\uB108\uBB34\uD798\uB4E4", "\uB108\uBB34\uD53C\uACE4", "\uC4F0\uB7EC\uC9C8", "\uC8FD\uACA0"];
var NEG1 = [
  "\uD53C\uACE4",
  "\uD798\uB4E4",
  "\uB098\uC058\uB2E4",
  "\uC544\uD504\uB2E4",
  "\uBB34\uAE30\uB825",
  "\uC878\uB9AC\uB2E4",
  "\uC878\uB9BC",
  "\uD798\uC5C6",
  "\uC9C0\uCCE4",
  "\uB450\uD1B5",
  "\uC2A4\uD2B8\uB808\uC2A4",
  "\uBD88\uC548",
  "\uC6B0\uC6B8",
  "\uBABB\uC7A4",
  "\uBABB\uBA39",
  "\uCC0C\uBFCC",
  "\uBED0\uADFC",
  "\uBB34\uAC81",
  "\uC9D1\uC911\uC548",
  "\uCEE8\uB514\uC158\uB098",
  "\uBAB8\uC548\uC88B",
  "\uC758\uC695\uC5C6",
  "\uC9DC\uC99D",
  "\uBC88\uC544\uC6C3",
  "\uBAB8\uC0B4",
  "\uAC10\uAE30"
];
var KeywordScorer = class {
  static score(text) {
    const t = text.replace(/\s/g, "");
    let pts = 0;
    const hits = [];
    for (const w of POS2)
      if (t.includes(w)) {
        pts += 2;
        hits.push(`+${w}`);
      }
    for (const w of POS1)
      if (t.includes(w)) {
        pts += 1;
        hits.push(`+${w}`);
      }
    for (const w of NEG2)
      if (t.includes(w)) {
        pts -= 2;
        hits.push(`-${w}`);
      }
    for (const w of NEG1)
      if (t.includes(w)) {
        pts -= 1;
        hits.push(`-${w}`);
      }
    const raw = 5.5 + pts * 0.5;
    const score = Math.round(Math.min(10, Math.max(1, raw)) * 2) / 2;
    return {
      score,
      reason: hits.length > 0 ? hits.slice(0, 5).join(", ") : "\uC911\uB9BD"
    };
  }
};
var DailyConditionTracker = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.cachedData = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    this.registerView(TRACKER_VIEW_TYPE, (leaf) => new TrackerView(leaf, this));
    this.addRibbonIcon("activity", "\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4", () => this.activateView());
    this.addCommand({
      id: "open-condition-tracker",
      name: "\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4 \uC5F4\uAE30",
      callback: () => this.activateView()
    });
    this.addSettingTab(new TrackerSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      await this.autoDetectSettings();
      await this.checkMissedNotes();
      this.registerInterval(window.setInterval(() => this.checkAutoAnalyze(), 60 * 1e3));
    });
  }
  // 데일리노트 폴더 & 컨디션 섹션 헤더 자동 감지
  async autoDetectSettings() {
    var _a, _b, _c;
    const files = this.app.vault.getFiles().filter((f) => f.extension === "md");
    if (!this.settings.dailyNotesFolder) {
      const counts = /* @__PURE__ */ new Map();
      for (const f of files) {
        if (/^\d{4}-\d{2}-\d{2}/.test(f.basename)) {
          const folder2 = (_b = (_a = f.parent) == null ? void 0 : _a.path) != null ? _b : "";
          counts.set(folder2, ((_c = counts.get(folder2)) != null ? _c : 0) + 1);
        }
      }
      let best = "";
      let bestN = 0;
      counts.forEach((n, folder2) => {
        if (n > bestN) {
          bestN = n;
          best = folder2;
        }
      });
      this.settings.dailyNotesFolder = best;
    }
    const folder = this.settings.dailyNotesFolder;
    const samples = files.filter((f) => /^\d{4}-\d{2}-\d{2}/.test(f.basename) && (!folder || f.path.startsWith(folder))).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 3);
    for (const file of samples) {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      let heading = "";
      for (const line of lines) {
        if (/^#{1,4}\s/.test(line))
          heading = line.replace(/^#+\s*/, "").trim();
        if (line.match(/^[-*]\s+\[/) && heading) {
          this.settings.conditionSectionHeader = heading;
          break;
        }
      }
      if (this.settings.conditionSectionHeader !== DEFAULT_SETTINGS.conditionSectionHeader)
        break;
    }
    await this.saveData(this.buildSaveData());
  }
  // 실행 시: 최근 7일 중 미분석 노트 자동 처리
  async checkMissedNotes() {
    const parser = new DailyNoteParser(this.app, this.settings);
    const now = new Date();
    let updated = false;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = this.formatDate(d);
      if (!this.plugin_cachedHas(dateStr)) {
        await this.analyzeDate(dateStr, parser);
        updated = true;
      }
    }
    if (updated)
      await this.saveData(this.buildSaveData());
  }
  plugin_cachedHas(dateStr) {
    return this.cachedData.has(dateStr);
  }
  // 오전 5시 자동 분석
  async checkAutoAnalyze() {
    const now = new Date();
    const today = this.formatDate(now);
    if (now.getHours() === 5 && this.settings.lastAutoAnalyze !== today) {
      this.settings.lastAutoAnalyze = today;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      await this.analyzeDate(this.formatDate(yesterday));
      await this.saveData(this.buildSaveData());
    }
  }
  async analyzeDate(dateStr, parser) {
    const p = parser != null ? parser : new DailyNoteParser(this.app, this.settings);
    const file = p.findFileByDate(dateStr);
    if (!file)
      return;
    const noteData = await p.parseNote(file, dateStr);
    if (!noteData)
      return;
    if (noteData.freeText.length > 5) {
      const { score, reason } = KeywordScorer.score(noteData.freeText);
      noteData.conditionScore = score;
      noteData.scoreReason = reason;
      noteData.analyzedAt = Date.now();
    }
    this.cachedData.set(dateStr, noteData);
  }
  async analyzeRange(start, end) {
    const parser = new DailyNoteParser(this.app, this.settings);
    const files = parser.getDailyNoteFiles(start, end);
    for (const file of files) {
      const dateStr = parser.getDateFromFile(file);
      if (!dateStr)
        continue;
      const noteData = await parser.parseNote(file, dateStr);
      if (!noteData)
        continue;
      if (noteData.freeText.length > 5) {
        const { score, reason } = KeywordScorer.score(noteData.freeText);
        noteData.conditionScore = score;
        noteData.scoreReason = reason;
        noteData.analyzedAt = Date.now();
      }
      this.cachedData.set(dateStr, noteData);
    }
    await this.saveData(this.buildSaveData());
    return files.length;
  }
  buildSaveData() {
    const cache = {};
    this.cachedData.forEach((v, k) => {
      cache[k] = v;
    });
    return { settings: this.settings, cache };
  }
  async activateView() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(TRACKER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf(true);
      await leaf.setViewState({ type: TRACKER_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  async loadSettings() {
    var _a;
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (_a = data == null ? void 0 : data.settings) != null ? _a : {});
    if (data == null ? void 0 : data.cache) {
      Object.entries(data.cache).forEach(([k, v]) => this.cachedData.set(k, v));
    }
  }
  async saveSettings() {
    await this.saveData(this.buildSaveData());
  }
  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
};
var TrackerView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.currentView = "week";
    this.isAnalyzing = false;
    this.plugin = plugin;
  }
  getViewType() {
    return TRACKER_VIEW_TYPE;
  }
  getDisplayText() {
    return "\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4";
  }
  getIcon() {
    return "activity";
  }
  async onOpen() {
    const data = await this.getDataForView();
    if (data.length === 0) {
      this.isAnalyzing = true;
      await this.render();
      const { start, end } = this.getDateRange();
      await this.plugin.analyzeRange(start, end);
      this.isAnalyzing = false;
    }
    await this.render();
  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ct-container");
    const header = container.createDiv("ct-header");
    header.createEl("h2", { text: "\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4", cls: "ct-title" });
    const controls = header.createDiv("ct-controls");
    const tabs = controls.createDiv("ct-tabs");
    const labels = { week: "\uC8FC\uAC04", month: "\uC6D4\uAC04", year: "\uC5F0\uAC04" };
    ["week", "month", "year"].forEach((v) => {
      const btn = tabs.createEl("button", {
        text: labels[v],
        cls: `ct-tab${this.currentView === v ? " ct-tab--active" : ""}`
      });
      btn.onclick = async () => {
        this.currentView = v;
        const d = await this.getDataForView();
        if (d.length === 0) {
          this.isAnalyzing = true;
          await this.render();
          const { start, end } = this.getDateRange();
          await this.plugin.analyzeRange(start, end);
          this.isAnalyzing = false;
        }
        await this.render();
      };
    });
    const reBtn = controls.createEl("button", {
      text: this.isAnalyzing ? "\uBD84\uC11D \uC911..." : "\uC7AC\uBD84\uC11D",
      cls: "ct-btn-primary"
    });
    reBtn.disabled = this.isAnalyzing;
    reBtn.onclick = async () => {
      this.isAnalyzing = true;
      await this.render();
      const { start, end } = this.getDateRange();
      const n = await this.plugin.analyzeRange(start, end);
      new import_obsidian.Notice(`\uC7AC\uBD84\uC11D \uC644\uB8CC (${n}\uAC1C \uB178\uD2B8)`);
      this.isAnalyzing = false;
      await this.render();
    };
    if (this.isAnalyzing) {
      container.createDiv({ cls: "ct-loading", text: "\uB178\uD2B8\uB97C \uBD84\uC11D\uD558\uB294 \uC911\uC785\uB2C8\uB2E4..." });
      return;
    }
    const data = await this.getDataForView();
    const withScores = data.filter((d) => {
      var _a;
      return ((_a = d.conditionScore) != null ? _a : 0) > 0;
    });
    if (withScores.length > 0) {
      const stats = container.createDiv("ct-stats");
      const avg = withScores.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / withScores.length;
      const avgChecks = data.reduce((s, d) => s + d.checkedCount, 0) / data.length;
      stats.createDiv({ cls: "ct-stat", text: `\uD3C9\uADE0 \uCEE8\uB514\uC158 ${avg.toFixed(1)}\uC810` });
      stats.createDiv({ cls: "ct-stat", text: `\uD3C9\uADE0 \uCCB4\uD06C ${avgChecks.toFixed(1)}\uAC1C` });
      stats.createDiv({ cls: "ct-stat", text: `\uAE30\uB85D ${data.length}\uC77C` });
    }
    const chartArea = container.createDiv("ct-chart-area");
    if (data.length === 0) {
      const folder = this.plugin.settings.dailyNotesFolder;
      chartArea.createEl("p", {
        text: `\uC774 \uAE30\uAC04\uC758 \uB370\uC77C\uB9AC\uB178\uD2B8\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC124\uC815\uC5D0\uC11C \uD3F4\uB354 \uACBD\uB85C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694 (\uD604\uC7AC: "${folder || "\uC804\uCCB4 \uBCFC\uD2B8"}").`,
        cls: "ct-empty"
      });
    } else {
      this.renderChart(chartArea, data);
    }
    const insightsArea = container.createDiv("ct-insights-area");
    insightsArea.createEl("h3", { text: "\uC778\uC0AC\uC774\uD2B8 & \uC0C1\uAD00\uAD00\uACC4", cls: "ct-insights-title" });
    if (withScores.length >= 3) {
      this.renderCorrelations(insightsArea, withScores);
      this.renderStatInsights(insightsArea, withScores);
    } else {
      insightsArea.createEl("p", { text: "\uC778\uC0AC\uC774\uD2B8\uB97C \uBCF4\uB824\uBA74 3\uC77C \uC774\uC0C1\uC758 \uAE30\uB85D\uC774 \uD544\uC694\uD574\uC694.", cls: "ct-empty" });
    }
  }
  getDateRange() {
    const end = new Date();
    const start = new Date(end);
    if (this.currentView === "week")
      start.setDate(end.getDate() - 6);
    else if (this.currentView === "month")
      start.setDate(end.getDate() - 29);
    else
      start.setDate(end.getDate() - 364);
    return { start, end };
  }
  async getDataForView() {
    const { start, end } = this.getDateRange();
    const result = [];
    const cur = new Date(start);
    while (cur <= end) {
      const d = this.plugin.cachedData.get(this.plugin.formatDate(cur));
      if (d)
        result.push(d);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }
  renderChart(container, data) {
    const wrapper = container.createDiv("ct-chart-wrapper");
    const yAxis = wrapper.createDiv("ct-y-axis");
    for (let i = 10; i >= 0; i -= 2) {
      yAxis.createDiv({ cls: "ct-y-label", text: String(i) });
    }
    const chartEl = wrapper.createDiv("ct-chart");
    const barsEl = chartEl.createDiv("ct-bars");
    const display = this.currentView === "year" ? this.groupByMonth(data) : data.map((d) => {
      var _a, _b;
      return {
        label: d.date.slice(5),
        score: (_a = d.conditionScore) != null ? _a : 0,
        checks: d.checkedCount,
        tooltip: (_b = d.scoreReason) != null ? _b : ""
      };
    });
    display.forEach((item) => {
      const group = barsEl.createDiv("ct-bar-group");
      const barWrapper = group.createDiv("ct-bar-wrapper");
      const cls = item.score >= 8 ? "score-excellent" : item.score >= 6 ? "score-good" : item.score >= 4 ? "score-fair" : item.score > 0 ? "score-poor" : "score-none";
      const bar = barWrapper.createDiv(`ct-bar ${cls}`);
      bar.style.height = `${item.score * 10}%`;
      if (item.score > 0)
        bar.createDiv({ cls: "ct-bar-score", text: item.score % 1 === 0 ? String(item.score) : item.score.toFixed(1) });
      if (item.tooltip)
        bar.setAttribute("title", item.tooltip);
      const labelEl = group.createDiv("ct-bar-label");
      labelEl.createDiv({ cls: "ct-bar-date", text: item.label });
      labelEl.createDiv({ cls: "ct-bar-checks", text: `\u2713${item.checks}` });
    });
  }
  groupByMonth(data) {
    const months = {};
    data.forEach((d) => {
      const m = d.date.slice(0, 7);
      if (!months[m])
        months[m] = [];
      months[m].push(d);
    });
    return Object.entries(months).map(([month, items]) => {
      const scored = items.filter((i) => {
        var _a;
        return ((_a = i.conditionScore) != null ? _a : 0) > 0;
      });
      const avg = scored.length > 0 ? scored.reduce((s, i) => {
        var _a;
        return s + ((_a = i.conditionScore) != null ? _a : 0);
      }, 0) / scored.length : 0;
      return {
        label: month.slice(5) + "\uC6D4",
        score: Math.round(avg * 10) / 10,
        checks: Math.round(items.reduce((s, i) => s + i.checkedCount, 0) / items.length),
        tooltip: ""
      };
    });
  }
  // 항목별 통계 계산 (공통 헬퍼)
  buildItemStats(data) {
    const allLabels = /* @__PURE__ */ new Set();
    data.forEach((d) => d.checkboxItems.forEach((cb) => allLabels.add(cb.label)));
    const stats = [];
    const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
    allLabels.forEach((label) => {
      const withItem = sorted.filter((d) => d.checkboxItems.some((cb) => cb.label === label));
      const on = withItem.filter((d) => d.checkboxItems.some((cb) => cb.label === label && cb.checked));
      const off = withItem.filter((d) => d.checkboxItems.some((cb) => cb.label === label && !cb.checked));
      let streak = 0, missed = 0, cS = true, cM = true;
      for (const d of withItem) {
        const isOn = d.checkboxItems.some((cb) => cb.label === label && cb.checked);
        if (cS) {
          if (isOn)
            streak++;
          else
            cS = false;
        }
        if (cM) {
          if (!isOn)
            missed++;
          else
            cM = false;
        }
      }
      const onAvg = on.length > 0 ? on.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / on.length : 0;
      const offAvg = off.length > 0 ? off.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / off.length : 0;
      stats.push({
        label,
        diff: on.length > 0 && off.length > 0 ? onAvg - offAvg : 0,
        checkedAvg: onAvg,
        uncheckedAvg: offAvg,
        checkRate: withItem.length > 0 ? on.length / withItem.length : 0,
        streak,
        missed,
        hasEnoughData: on.length >= 2 && off.length >= 2
      });
    });
    return stats;
  }
  renderCorrelations(container, data) {
    const stats = this.buildItemStats(data).filter((s) => s.hasEnoughData);
    if (stats.length === 0) {
      container.createEl("p", { text: "\uD56D\uBAA9\uBCC4 \uBE44\uAD50\uC5D0 \uB370\uC774\uD130\uAC00 \uB354 \uD544\uC694\uD574\uC694.", cls: "ct-empty" });
      return;
    }
    container.createEl("h4", { text: "\uD56D\uBAA9\uBCC4 \uCEE8\uB514\uC158 \uC601\uD5A5\uB3C4", cls: "ct-impact-title" });
    const tiers = [
      { key: "critical", label: "\uD575\uC2EC \uC2B5\uAD00", sub: "\uC5C6\uC73C\uBA74 \uCEE8\uB514\uC158\uC774 \uD06C\uAC8C \uB5A8\uC5B4\uC838\uC694", items: stats.filter((s) => s.diff >= 1.5) },
      { key: "good", label: "\uB3C4\uC6C0\uC774 \uB418\uB294 \uC2B5\uAD00", sub: "\uC788\uC744 \uB54C \uB354 \uC88B\uC544\uC694", items: stats.filter((s) => s.diff >= 0.4 && s.diff < 1.5) },
      { key: "neutral", label: "\uC601\uD5A5 \uB0AE\uC74C", sub: "\uCEE8\uB514\uC158\uACFC \uC5F0\uAD00\uC774 \uC801\uC5B4\uC694", items: stats.filter((s) => Math.abs(s.diff) < 0.4) },
      { key: "bad", label: "\uD53C\uD558\uBA74 \uC88B\uC740 \uAC83", sub: "\uCCB4\uD06C\uD560\uC218\uB85D \uCEE8\uB514\uC158\uC774 \uB0AE\uC544\uC694", items: stats.filter((s) => s.diff < -0.4) }
    ];
    const maxDiff = Math.max(...stats.map((s) => Math.abs(s.diff)), 1);
    tiers.forEach((tier) => {
      if (tier.items.length === 0)
        return;
      const sec = container.createDiv(`ct-tier ct-tier--${tier.key}`);
      const hdr = sec.createDiv("ct-tier-hdr");
      hdr.createEl("span", { text: tier.label, cls: "ct-tier-name" });
      hdr.createEl("span", { text: tier.sub, cls: "ct-tier-sub" });
      tier.items.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).forEach((item) => {
        const row = sec.createDiv("ct-impact-row");
        const left = row.createDiv("ct-impact-left");
        left.createEl("span", { text: item.label, cls: "ct-impact-name" });
        if (item.missed >= 3)
          left.createEl("span", { text: `${item.missed}\uC77C \uC9F8 \uBBF8\uCCB4\uD06C`, cls: "ct-badge ct-badge--warn" });
        else if (item.streak >= 3)
          left.createEl("span", { text: `${item.streak}\uC77C \uC5F0\uC18D`, cls: "ct-badge ct-badge--good" });
        const right = row.createDiv("ct-impact-right");
        const barWrap = right.createDiv("ct-impact-bar-track");
        const bar = barWrap.createDiv(`ct-impact-bar ${item.diff >= 0 ? "ct-impact-bar--pos" : "ct-impact-bar--neg"}`);
        bar.style.width = `${Math.round(Math.abs(item.diff) / maxDiff * 100)}%`;
        const meta = right.createDiv("ct-impact-meta");
        meta.createEl("span", { cls: "ct-impact-diff", text: `${item.diff >= 0 ? "+" : ""}${item.diff.toFixed(1)}\uC810` });
        meta.createEl("span", { cls: "ct-impact-rate", text: `\uCCB4\uD06C\uC728 ${Math.round(item.checkRate * 100)}%` });
      });
    });
  }
  renderStatInsights(container, data) {
    if (data.length < 5)
      return;
    const stats = this.buildItemStats(data).filter((s) => s.hasEnoughData);
    const scores = data.map((d) => {
      var _a;
      return (_a = d.conditionScore) != null ? _a : 0;
    }).filter((s) => s > 0);
    const mid = Math.floor(scores.length / 2);
    const recentAvg = scores.slice(mid).reduce((s, v) => s + v, 0) / Math.max(scores.length - mid, 1);
    const earlyAvg = scores.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1);
    const trend = recentAvg - earlyAvg;
    const sorted = [...stats].sort((a, b) => b.diff - a.diff);
    const lacking = sorted.filter((s) => s.diff > 0.5 && s.missed >= 2);
    const goingWell = sorted.filter((s) => s.diff > 0.3 && (s.streak >= 3 || s.checkRate > 0.65));
    const topItem = sorted[0];
    const wrap = container.createDiv("ct-narrative-wrap");
    const c1 = wrap.createDiv("ct-narrative-card ct-narrative-card--lack");
    c1.createDiv({ cls: "ct-narrative-icon", text: "\u{1F534}" });
    c1.createEl("h4", { cls: "ct-narrative-heading", text: "\uCD5C\uADFC \uBD80\uC871\uD55C \uAC83" });
    const b1 = c1.createDiv("ct-narrative-body");
    if (lacking.length === 0 && trend >= -0.3) {
      b1.createEl("p", { text: "\uD2B9\uBCC4\uD788 \uBE60\uC9C4 \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694. \uADE0\uD615 \uC788\uAC8C \uC798 \uC720\uC9C0\uD558\uACE0 \uC788\uC5B4\uC694." });
    } else {
      lacking.slice(0, 2).forEach((s) => {
        b1.createEl("p", { text: `"${s.label}"\uC774 ${s.missed}\uC77C \uC5F0\uC18D \uBE60\uC838\uC788\uC5B4\uC694. \uC5C6\uB294 \uB0A0 \uCEE8\uB514\uC158\uC774 \uD3C9\uADE0 ${s.diff.toFixed(1)}\uC810 \uB0AE\uC544\uC694.` });
      });
      if (trend < -0.5)
        b1.createEl("p", { text: `\uC804\uBC18\uC801\uC73C\uB85C \uCEE8\uB514\uC158\uC774 \uC774\uC804\uBCF4\uB2E4 ${Math.abs(trend).toFixed(1)}\uC810 \uB0AE\uC544\uC84C\uC5B4\uC694.` });
    }
    const c2 = wrap.createDiv("ct-narrative-card ct-narrative-card--good");
    c2.createDiv({ cls: "ct-narrative-icon", text: "\u2705" });
    c2.createEl("h4", { cls: "ct-narrative-heading", text: "\uC798 \uD558\uACE0 \uC788\uB294 \uAC83" });
    const b2 = c2.createDiv("ct-narrative-body");
    if (goingWell.length === 0) {
      b2.createEl("p", { text: "\uC544\uC9C1 \uAFB8\uC900\uD55C \uD56D\uBAA9\uC774 \uB9CE\uC9C0 \uC54A\uC544\uC694. \uB370\uC774\uD130\uAC00 \uB354 \uC313\uC774\uBA74 \uBCF4\uC5EC\uC694." });
    } else {
      goingWell.slice(0, 2).forEach((s) => {
        if (s.streak >= 3)
          b2.createEl("p", { text: `"${s.label}"\uC744 ${s.streak}\uC77C \uC5F0\uC18D \uCC59\uAE30\uACE0 \uC788\uC5B4\uC694! \uCEE8\uB514\uC158\uC5D0 ${s.diff.toFixed(1)}\uC810 \uAE30\uC5EC\uD574\uC694.` });
        else
          b2.createEl("p", { text: `"${s.label}" \uCCB4\uD06C\uC728\uC774 ${Math.round(s.checkRate * 100)}%\uB85C \uAFB8\uC900\uD574\uC694. \uCEE8\uB514\uC158\uC5D0 ${s.diff.toFixed(1)}\uC810 \uC601\uD5A5\uC744 \uC918\uC694.` });
      });
      if (trend > 0.5)
        b2.createEl("p", { text: `\uC804\uBC18\uC801\uC73C\uB85C \uCEE8\uB514\uC158\uC774 \uC774\uC804\uBCF4\uB2E4 ${trend.toFixed(1)}\uC810 \uC62C\uB77C\uAC00\uB294 \uC911\uC774\uC5D0\uC694.` });
    }
    const c3 = wrap.createDiv("ct-narrative-card ct-narrative-card--advice");
    c3.createDiv({ cls: "ct-narrative-icon", text: "\u{1F4A1}" });
    c3.createEl("h4", { cls: "ct-narrative-heading", text: "\uC774\uB807\uAC8C \uD574\uBCF4\uC138\uC694" });
    const b3 = c3.createDiv("ct-narrative-body");
    const advLines = [];
    if (lacking.length > 0)
      advLines.push(`\uC624\uB298\uBD80\uD130 "${lacking[0].label}"\uC744 \uB2E4\uC2DC \uCC59\uACA8\uBCF4\uC138\uC694. \uCEE8\uB514\uC158\uC774 \uBE60\uB974\uAC8C \uD68C\uBCF5\uB420 \uC218 \uC788\uC5B4\uC694.`);
    if (topItem && topItem.diff >= 1)
      advLines.push(`\uAC00\uC7A5 \uD575\uC2EC\uC740 "${topItem.label}"\uC774\uC5D0\uC694. \uB2E4\uB978 \uAC8C \uD798\uB4E4\uB354\uB77C\uB3C4 \uC774\uAC83\uB9CC\uC740 \uC9C0\uCF1C\uBD10\uC694.`);
    const lowImpact = stats.filter((s) => Math.abs(s.diff) < 0.3);
    if (lowImpact.length >= 2)
      advLines.push(`"${lowImpact.slice(0, 2).map((s) => s.label).join('", "')}"\uC740 \uCEE8\uB514\uC158 \uC601\uD5A5\uC774 \uC791\uC544\uC694. \uC5D0\uB108\uC9C0\uB97C \uD575\uC2EC \uD56D\uBAA9\uC5D0 \uC9D1\uC911\uD574\uBCF4\uB294 \uAC83\uB3C4 \uC88B\uC544\uC694.`);
    if (advLines.length === 0)
      advLines.push("\uAE30\uB85D\uC744 \uACC4\uC18D \uC313\uC544\uAC00\uC138\uC694. 2\uC8FC \uC774\uC0C1\uC758 \uB370\uC774\uD130\uAC00 \uBAA8\uC774\uBA74 \uD6E8\uC52C \uAD6C\uCCB4\uC801\uC778 \uC870\uC5B8\uC744 \uB4DC\uB9B4 \uC218 \uC788\uC5B4\uC694.");
    advLines.forEach((l) => b3.createEl("p", { text: l }));
  }
};
var DailyNoteParser = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  getDailyNoteFiles(startDate, endDate) {
    const folder = this.settings.dailyNotesFolder;
    return this.app.vault.getFiles().filter((f) => {
      if (f.extension !== "md")
        return false;
      if (folder && !f.path.startsWith(folder))
        return false;
      const d = this.getDateFromFile(f);
      if (!d)
        return false;
      const dt = new Date(d);
      return dt >= startDate && dt <= endDate;
    });
  }
  findFileByDate(dateStr) {
    var _a;
    const folder = this.settings.dailyNotesFolder;
    return (_a = this.app.vault.getFiles().find((f) => {
      if (f.extension !== "md")
        return false;
      if (folder && !f.path.startsWith(folder))
        return false;
      return this.getDateFromFile(f) === dateStr;
    })) != null ? _a : null;
  }
  getDateFromFile(file) {
    const m = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  async parseNote(file, dateStr) {
    const content = await this.app.vault.read(file);
    const checkboxItems = this.parseCheckboxes(content);
    const freeText = this.extractFreeText(content);
    return { date: dateStr, checkboxItems, checkedCount: checkboxItems.filter((cb) => cb.checked).length, freeText };
  }
  parseCheckboxes(content) {
    const items = [];
    for (const line of content.split("\n")) {
      const m = line.match(/^[-*]\s+\[(x|X| )\]\s+(.+)$/);
      if (m)
        items.push({ label: m[2].trim(), checked: m[1].toLowerCase() === "x" });
    }
    return items;
  }
  extractFreeText(content) {
    const header = this.settings.conditionSectionHeader;
    const idx = content.search(new RegExp(`(#{1,6}\\s*)?${header}`, "i"));
    if (idx > -1)
      return content.substring(0, idx).trim();
    return content.split("\n").filter((l) => !l.match(/^[-*]\s+\[/)).join("\n").trim();
  }
};
var TrackerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Daily Condition Tracker \uC124\uC815" });
    const info = containerEl.createDiv("ct-settings-info");
    info.createEl("p", { text: `\uC790\uB3D9 \uAC10\uC9C0 \uACB0\uACFC \u2014 \uD3F4\uB354: "${this.plugin.settings.dailyNotesFolder || "\uC804\uCCB4 \uBCFC\uD2B8"}" / \uC139\uC158: "${this.plugin.settings.conditionSectionHeader}"` });
    new import_obsidian.Setting(containerEl).setName("\uB370\uC77C\uB9AC\uB178\uD2B8 \uD3F4\uB354").setDesc("\uC790\uB3D9 \uAC10\uC9C0\uB429\uB2C8\uB2E4. \uB9DE\uC9C0 \uC54A\uC73C\uBA74 \uC9C1\uC811 \uC785\uB825 (\uC608: Daily Notes)").addText((t) => t.setPlaceholder("Daily Notes").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (v) => {
      this.plugin.settings.dailyNotesFolder = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\uCEE8\uB514\uC158 \uC139\uC158 \uD5E4\uB354").setDesc("\uCCB4\uD06C\uBC15\uC2A4\uAC00 \uC18D\uD55C \uD5E4\uB354 \uD14D\uC2A4\uD2B8 (\uC790\uB3D9 \uAC10\uC9C0)").addText((t) => t.setPlaceholder("\uCEE8\uB514\uC158").setValue(this.plugin.settings.conditionSectionHeader).onChange(async (v) => {
      this.plugin.settings.conditionSectionHeader = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\uC790\uB3D9 \uAC10\uC9C0 \uC7AC\uC2E4\uD589").setDesc("\uBCFC\uD2B8\uB97C \uB2E4\uC2DC \uC2A4\uCE94\uD574 \uD3F4\uB354/\uD5E4\uB354\uB97C \uCC3E\uC2B5\uB2C8\uB2E4").addButton((b) => b.setButtonText("\uC7AC\uAC10\uC9C0").onClick(async () => {
      this.plugin.settings.dailyNotesFolder = "";
      await this.plugin.autoDetectSettings();
      this.display();
      new import_obsidian.Notice(`\uD3F4\uB354: ${this.plugin.settings.dailyNotesFolder || "\uC804\uCCB4"} / \uD5E4\uB354: ${this.plugin.settings.conditionSectionHeader}`);
    }));
    new import_obsidian.Setting(containerEl).setName("\uCE90\uC2DC \uCD08\uAE30\uD654").setDesc("\uC800\uC7A5\uB41C \uBD84\uC11D\uC744 \uC9C0\uC6B0\uACE0 \uD2B8\uB798\uCEE4 \uC5F4 \uB54C \uC7AC\uBD84\uC11D\uD569\uB2C8\uB2E4").addButton((b) => b.setButtonText("\uCD08\uAE30\uD654").setWarning().onClick(async () => {
      this.plugin.cachedData.clear();
      await this.plugin.saveData(this.plugin.buildSaveData());
      new import_obsidian.Notice("\uCD08\uAE30\uD654 \uC644\uB8CC. \uD2B8\uB798\uCEE4\uB97C \uB2E4\uC2DC \uC5F4\uBA74 \uC790\uB3D9\uC73C\uB85C \uC7AC\uBD84\uC11D\uB429\uB2C8\uB2E4.");
    }));
  }
};
