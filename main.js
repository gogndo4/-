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
var DailyConditionTracker = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
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
    this.registerInterval(window.setInterval(() => this.checkAutoAnalyze(), 60 * 1e3));
    this.checkAutoAnalyze();
  }
  async checkAutoAnalyze() {
    const now = new Date();
    const today = this.formatDate(now);
    if (now.getHours() === 5 && this.settings.lastAutoAnalyze !== today) {
      this.settings.lastAutoAnalyze = today;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = this.formatDate(yesterday);
      if (!this.cachedData.has(yesterdayStr)) {
        new import_obsidian.Notice("\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4: \uC5B4\uC81C \uB178\uD2B8\uB97C \uBD84\uC11D\uD569\uB2C8\uB2E4...");
        await this.analyzeDate(yesterdayStr);
        new import_obsidian.Notice("\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4: \uBD84\uC11D \uC644\uB8CC!");
      }
      await this.saveData(this.buildSaveData());
    }
  }
  async analyzeDate(dateStr) {
    const parser = new DailyNoteParser(this.app, this.settings);
    const file = parser.findFileByDate(dateStr);
    if (!file)
      return;
    const noteData = await parser.parseNote(file, dateStr);
    if (!noteData)
      return;
    if (noteData.freeText.length > 5) {
      const result = KeywordScorer.score(noteData.freeText);
      noteData.conditionScore = result.score;
      noteData.scoreReason = result.reason;
      noteData.analyzedAt = Date.now();
    }
    this.cachedData.set(dateStr, noteData);
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
var POSITIVE_STRONG = ["\uCD5C\uACE0", "\uC644\uBCBD", "\uB118\uCE58", "\uB108\uBB34\uC88B", "\uC5C4\uCCAD\uC88B", "\uAE30\uBD84\uCD5C\uACE0", "\uCEE8\uB514\uC158\uCD5C\uACE0"];
var POSITIVE = [
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
  "\uB9D1\uB2E4",
  "\uB9D1\uC74C",
  "\uC0C1\uD07C",
  "\uC218\uC6D4",
  "\uC6D0\uD65C",
  "\uAC00\uBFD0",
  "\uC0C1\uD0DC\uC88B",
  "\uBAB8\uC88B",
  "\uCEE8\uB514\uC158\uC88B",
  "\uC758\uC695",
  "\uC9D1\uC911\uC798",
  "\uC798\uD480",
  "\uC0DD\uC0B0\uC801",
  "\uD65C\uB825",
  "\uC5F4\uC815",
  "\uBFCC\uB4EF",
  "\uC131\uCDE8"
];
var NEGATIVE_STRONG = ["\uCD5C\uC545", "\uB108\uBB34\uD798", "\uB108\uBB34\uD53C\uACE4", "\uC2EC\uD558\uAC8C\uC544", "\uC8FD\uACA0", "\uC4F0\uB7EC"];
var NEGATIVE = [
  "\uD53C\uACE4",
  "\uD798\uB4E4",
  "\uB098\uC058\uB2E4",
  "\uC544\uD504\uB2E4",
  "\uBB34\uAE30\uB825",
  "\uC878\uB9AC\uB2E4",
  "\uC878\uB9BC",
  "\uD798\uC5C6",
  "\uC9C0\uCE68",
  "\uB450\uD1B5",
  "\uC2A4\uD2B8\uB808\uC2A4",
  "\uBD88\uC548",
  "\uC6B0\uC6B8",
  "\uBABB\uC7A4",
  "\uBABB\uBA39",
  "\uCC0C\uBFCC",
  "\uBED0\uADFC",
  "\uBB34\uAC81",
  "\uC9C0\uB8E8",
  "\uC9D1\uC911\uC548",
  "\uD750\uB9AC\uBA4D",
  "\uBAB8\uBB34\uAC70",
  "\uCEE8\uB514\uC158\uB098",
  "\uC0C1\uD0DC\uC548",
  "\uBAB8\uC548\uC88B",
  "\uC758\uC695\uC5C6",
  "\uC9DC\uC99D",
  "\uB2F5\uB2F5",
  "\uBB34\uB108",
  "\uBC88\uC544\uC6C3",
  "\uBC88\uC544",
  "\uBAB8\uC0B4",
  "\uAC10\uAE30",
  "\uC5F4\uC774"
];
var KeywordScorer = class {
  static score(text) {
    const t = text.replace(/\s/g, "");
    let points = 0;
    const hits = [];
    for (const w of POSITIVE_STRONG) {
      if (t.includes(w)) {
        points += 2;
        hits.push(`+${w}`);
      }
    }
    for (const w of POSITIVE) {
      if (t.includes(w)) {
        points += 1;
        hits.push(`+${w}`);
      }
    }
    for (const w of NEGATIVE_STRONG) {
      if (t.includes(w)) {
        points -= 2;
        hits.push(`-${w}`);
      }
    }
    for (const w of NEGATIVE) {
      if (t.includes(w)) {
        points -= 1;
        hits.push(`-${w}`);
      }
    }
    const raw = 5.5 + points * 0.5;
    const clamped = Math.min(10, Math.max(1, raw));
    const score = Math.round(clamped * 2) / 2;
    const reason = hits.length > 0 ? hits.slice(0, 4).join(", ") : "\uD0A4\uC6CC\uB4DC \uC5C6\uC74C (\uC911\uB9BD)";
    return { score, reason };
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
    const viewLabels = { week: "\uC8FC\uAC04", month: "\uC6D4\uAC04", year: "\uC5F0\uAC04" };
    ["week", "month", "year"].forEach((v) => {
      const btn = tabs.createEl("button", {
        text: viewLabels[v],
        cls: `ct-tab ${this.currentView === v ? "ct-tab--active" : ""}`
      });
      btn.onclick = async () => {
        this.currentView = v;
        await this.render();
      };
    });
    const analyzeBtn = controls.createEl("button", {
      text: this.isAnalyzing ? "\uBD84\uC11D \uC911..." : "\uBD84\uC11D \uC2DC\uC791",
      cls: "ct-btn-primary"
    });
    analyzeBtn.disabled = this.isAnalyzing;
    analyzeBtn.onclick = () => this.runAnalysis(container);
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
      stats.createDiv({ cls: "ct-stat", text: `\uD3C9\uADE0 \uCEE8\uB514\uC158: ${avg.toFixed(1)}\uC810` });
      stats.createDiv({ cls: "ct-stat", text: `\uD3C9\uADE0 \uCCB4\uD06C: ${avgChecks.toFixed(1)}\uAC1C` });
      stats.createDiv({ cls: "ct-stat", text: `\uAE30\uB85D \uC77C\uC218: ${data.length}\uC77C` });
    }
    const chartArea = container.createDiv("ct-chart-area");
    if (data.length === 0) {
      chartArea.createEl("p", { text: "\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBD84\uC11D \uC2DC\uC791 \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694.", cls: "ct-empty" });
    } else {
      this.renderChart(chartArea, data);
    }
    const insightsArea = container.createDiv("ct-insights-area");
    insightsArea.createEl("h3", { text: "\uC778\uC0AC\uC774\uD2B8 & \uC0C1\uAD00\uAD00\uACC4", cls: "ct-insights-title" });
    if (withScores.length >= 3) {
      this.renderCorrelations(insightsArea, withScores);
      this.renderStatInsights(insightsArea, withScores);
    } else {
      insightsArea.createEl("p", { text: "\uC778\uC0AC\uC774\uD2B8\uB97C \uD45C\uC2DC\uD558\uB824\uBA74 3\uC77C \uC774\uC0C1\uC758 \uBD84\uC11D \uB370\uC774\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.", cls: "ct-empty" });
    }
  }
  async runAnalysis(_container) {
    this.isAnalyzing = true;
    await this.render();
    try {
      const parser = new DailyNoteParser(this.app, this.plugin.settings);
      const { start, end } = this.getDateRange();
      const files = parser.getDailyNoteFiles(start, end);
      let count = 0;
      for (const file of files) {
        const dateStr = parser.getDateFromFile(file);
        if (!dateStr)
          continue;
        const noteData = await parser.parseNote(file, dateStr);
        if (!noteData)
          continue;
        if (noteData.freeText.length > 5) {
          const result = KeywordScorer.score(noteData.freeText);
          noteData.conditionScore = result.score;
          noteData.scoreReason = result.reason;
          noteData.analyzedAt = Date.now();
        }
        this.plugin.cachedData.set(dateStr, noteData);
        count++;
      }
      await this.plugin.saveData(this.plugin.buildSaveData());
      new import_obsidian.Notice(`${count}\uAC1C \uB178\uD2B8 \uBD84\uC11D \uC644\uB8CC (\uB85C\uCEEC)`);
    } catch (e) {
      new import_obsidian.Notice(`\uBD84\uC11D \uC2E4\uD328: ${e.message}`);
    } finally {
      this.isAnalyzing = false;
      await this.render();
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
      const dateStr = this.plugin.formatDate(cur);
      const d = this.plugin.cachedData.get(dateStr);
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
    const displayData = this.currentView === "year" ? this.groupByMonth(data) : data.map((d) => {
      var _a, _b;
      return {
        label: d.date.slice(5),
        score: (_a = d.conditionScore) != null ? _a : 0,
        checks: d.checkedCount,
        tooltip: (_b = d.scoreReason) != null ? _b : ""
      };
    });
    displayData.forEach((item) => {
      const group = barsEl.createDiv("ct-bar-group");
      const barWrapper = group.createDiv("ct-bar-wrapper");
      const scoreClass = item.score >= 8 ? "score-excellent" : item.score >= 6 ? "score-good" : item.score >= 4 ? "score-fair" : item.score > 0 ? "score-poor" : "score-none";
      const bar = barWrapper.createDiv(`ct-bar ${scoreClass}`);
      bar.style.height = `${item.score * 10}%`;
      if (item.score > 0) {
        bar.createDiv({ cls: "ct-bar-score", text: item.score % 1 === 0 ? String(item.score) : item.score.toFixed(1) });
      }
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
      const avgScore = scored.length > 0 ? scored.reduce((s, i) => {
        var _a;
        return s + ((_a = i.conditionScore) != null ? _a : 0);
      }, 0) / scored.length : 0;
      const avgChecks = items.reduce((s, i) => s + i.checkedCount, 0) / items.length;
      return {
        label: month.slice(5) + "\uC6D4",
        score: Math.round(avgScore * 10) / 10,
        checks: Math.round(avgChecks),
        tooltip: ""
      };
    });
  }
  renderCorrelations(container, data) {
    const allLabels = /* @__PURE__ */ new Set();
    data.forEach((d) => d.checkboxItems.forEach((cb) => allLabels.add(cb.label)));
    const correlations = [];
    allLabels.forEach((label) => {
      const checked = data.filter((d) => d.checkboxItems.some((cb) => cb.label === label && cb.checked));
      const unchecked = data.filter((d) => d.checkboxItems.some((cb) => cb.label === label && !cb.checked));
      if (checked.length < 2 || unchecked.length < 2)
        return;
      const checkedAvg = checked.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / checked.length;
      const uncheckedAvg = unchecked.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / unchecked.length;
      correlations.push({
        label,
        checkedAvg,
        uncheckedAvg,
        diff: checkedAvg - uncheckedAvg,
        checkedN: checked.length,
        uncheckedN: unchecked.length
      });
    });
    correlations.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (correlations.length === 0) {
      container.createEl("p", { text: "\uC0C1\uAD00\uAD00\uACC4 \uBD84\uC11D\uC744 \uC704\uD55C \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.", cls: "ct-empty" });
      return;
    }
    const grid = container.createDiv("ct-corr-grid");
    correlations.slice(0, 8).forEach((c) => {
      const card = grid.createDiv(`ct-corr-card ${c.diff >= 0 ? "ct-corr-pos" : "ct-corr-neg"}`);
      card.createDiv({ cls: "ct-corr-label", text: c.label });
      const diffSign = c.diff >= 0 ? "+" : "";
      card.createDiv({ cls: "ct-corr-diff", text: `${diffSign}${c.diff.toFixed(1)}` });
      card.createDiv({ cls: "ct-corr-detail", text: `\uCCB4\uD06C:${c.checkedAvg.toFixed(1)} \uBBF8\uCCB4\uD06C:${c.uncheckedAvg.toFixed(1)}` });
    });
  }
  renderStatInsights(container, data) {
    if (data.length < 5)
      return;
    const allLabels = /* @__PURE__ */ new Set();
    data.forEach((d) => d.checkboxItems.forEach((cb) => allLabels.add(cb.label)));
    const correlations = [];
    allLabels.forEach((label) => {
      const checked = data.filter((d) => d.checkboxItems.some((cb) => cb.label === label && cb.checked));
      const unchecked = data.filter((d) => d.checkboxItems.some((cb) => cb.label === label && !cb.checked));
      if (checked.length < 2 || unchecked.length < 2)
        return;
      const checkedAvg = checked.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / checked.length;
      const uncheckedAvg = unchecked.reduce((s, d) => {
        var _a;
        return s + ((_a = d.conditionScore) != null ? _a : 0);
      }, 0) / unchecked.length;
      correlations.push({ label, diff: checkedAvg - uncheckedAvg, checkedAvg });
    });
    correlations.sort((a, b) => b.diff - a.diff);
    const scores = data.map((d) => {
      var _a;
      return (_a = d.conditionScore) != null ? _a : 0;
    }).filter((s) => s > 0);
    const recentHalf = scores.slice(Math.floor(scores.length / 2));
    const earlyHalf = scores.slice(0, Math.floor(scores.length / 2));
    const recentAvg = recentHalf.reduce((s, v) => s + v, 0) / (recentHalf.length || 1);
    const earlyAvg = earlyHalf.reduce((s, v) => s + v, 0) / (earlyHalf.length || 1);
    const trend = recentAvg - earlyAvg;
    const lines = [];
    if (correlations.length > 0) {
      const top = correlations[0];
      if (top.diff > 0.5) {
        lines.push(`"${top.label}" \uD56D\uBAA9\uC774 \uCCB4\uD06C\uB410\uC744 \uB54C \uCEE8\uB514\uC158\uC774 \uD3C9\uADE0 ${top.diff.toFixed(1)}\uC810 \uB192\uC544\uC694. \uAC00\uC7A5 \uD575\uC2EC \uC2B5\uAD00\uC785\uB2C8\uB2E4.`);
      }
      const bottom = correlations[correlations.length - 1];
      if (bottom.diff < -0.5) {
        lines.push(`"${bottom.label}"\uC774 \uBE60\uC9C4 \uB0A0\uC740 \uCEE8\uB514\uC158\uC774 ${Math.abs(bottom.diff).toFixed(1)}\uC810 \uB0AE\uC544\uC694. \uBE60\uD2B8\uB9AC\uC9C0 \uB9C8\uC138\uC694.`);
      }
    }
    if (Math.abs(trend) > 0.3) {
      lines.push(
        trend > 0 ? `\uCD5C\uADFC \uCEE8\uB514\uC158\uC774 \uC0C1\uC2B9 \uCD94\uC138\uC608\uC694 (+${trend.toFixed(1)}). \uC798 \uD558\uACE0 \uC788\uC5B4\uC694!` : `\uCD5C\uADFC \uCEE8\uB514\uC158\uC774 \uD558\uB77D \uCD94\uC138\uC608\uC694 (${trend.toFixed(1)}). \uB8E8\uD2F4\uC744 \uC810\uAC80\uD574\uBCF4\uC138\uC694.`
      );
    }
    const checkScorePairs = data.filter((d) => {
      var _a;
      return ((_a = d.conditionScore) != null ? _a : 0) > 0;
    }).map((d) => {
      var _a;
      return { checks: d.checkedCount, score: (_a = d.conditionScore) != null ? _a : 0 };
    });
    if (checkScorePairs.length >= 4) {
      const high = checkScorePairs.filter((p) => p.checks >= Math.ceil(checkScorePairs.reduce((s, p2) => s + p2.checks, 0) / checkScorePairs.length));
      const low = checkScorePairs.filter((p) => p.checks < Math.ceil(checkScorePairs.reduce((s, p2) => s + p2.checks, 0) / checkScorePairs.length));
      if (high.length > 0 && low.length > 0) {
        const highAvg = high.reduce((s, p) => s + p.score, 0) / high.length;
        const lowAvg = low.reduce((s, p) => s + p.score, 0) / low.length;
        if (highAvg - lowAvg > 0.5) {
          lines.push(`\uCCB4\uD06C\uB97C \uB9CE\uC774 \uD560\uC218\uB85D \uCEE8\uB514\uC158\uC774 \uC88B\uC544\uC694. \uCCB4\uD06C \uB9CE\uC740 \uB0A0 \uD3C9\uADE0 ${highAvg.toFixed(1)}\uC810 vs \uC801\uC740 \uB0A0 ${lowAvg.toFixed(1)}\uC810.`);
        }
      }
    }
    if (lines.length === 0)
      return;
    const box = container.createDiv("ct-stat-insight-box");
    box.createEl("h4", { text: "\uD1B5\uACC4 \uC778\uC0AC\uC774\uD2B8", cls: "ct-stat-insight-title" });
    const ul = box.createEl("ul", { cls: "ct-stat-insight-list" });
    lines.forEach((l) => ul.createEl("li", { text: l }));
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
      const dateStr = this.getDateFromFile(f);
      if (!dateStr)
        return false;
      const d = new Date(dateStr);
      return d >= startDate && d <= endDate;
    });
  }
  findFileByDate(dateStr) {
    var _a;
    const folder = this.settings.dailyNotesFolder;
    const files = this.app.vault.getFiles();
    return (_a = files.find((f) => {
      if (f.extension !== "md")
        return false;
      if (folder && !f.path.startsWith(folder))
        return false;
      return this.getDateFromFile(f) === dateStr;
    })) != null ? _a : null;
  }
  getDateFromFile(file) {
    const match = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }
  async parseNote(file, dateStr) {
    const content = await this.app.vault.read(file);
    const checkboxItems = this.parseCheckboxes(content);
    const freeText = this.extractFreeText(content);
    return {
      date: dateStr,
      checkboxItems,
      checkedCount: checkboxItems.filter((cb) => cb.checked).length,
      freeText
    };
  }
  parseCheckboxes(content) {
    const items = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^[-*]\s+\[(x|X| )\]\s+(.+)$/);
      if (match) {
        items.push({ label: match[2].trim(), checked: match[1].toLowerCase() === "x" });
      }
    }
    return items;
  }
  extractFreeText(content) {
    const header = this.settings.conditionSectionHeader;
    const sectionIdx = content.search(new RegExp(`(#{1,6}\\s*)?${header}`, "i"));
    if (sectionIdx > -1) {
      return content.substring(0, sectionIdx).trim();
    }
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
    new import_obsidian.Setting(containerEl).setName("\uB370\uC77C\uB9AC\uB178\uD2B8 \uD3F4\uB354").setDesc("\uB370\uC77C\uB9AC\uB178\uD2B8\uAC00 \uC788\uB294 \uD3F4\uB354 \uACBD\uB85C (\uBE44\uC6CC\uB450\uBA74 \uC804\uCCB4 \uBCFC\uD2B8 \uAC80\uC0C9)").addText((t) => t.setPlaceholder("Daily Notes").setValue(this.plugin.settings.dailyNotesFolder).onChange(async (v) => {
      this.plugin.settings.dailyNotesFolder = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\uCEE8\uB514\uC158 \uC139\uC158 \uD5E4\uB354").setDesc("\uCCB4\uD06C\uBC15\uC2A4\uB4E4\uC774 \uC788\uB294 \uC139\uC158\uC758 \uD5E4\uB354 \uD14D\uC2A4\uD2B8").addText((t) => t.setPlaceholder("\uCEE8\uB514\uC158").setValue(this.plugin.settings.conditionSectionHeader).onChange(async (v) => {
      this.plugin.settings.conditionSectionHeader = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\uBD84\uC11D \uCE90\uC2DC \uCD08\uAE30\uD654").setDesc("\uC800\uC7A5\uB41C \uBD84\uC11D \uB370\uC774\uD130\uB97C \uC0AD\uC81C\uD558\uACE0 \uCC98\uC74C\uBD80\uD130 \uB2E4\uC2DC \uBD84\uC11D\uD569\uB2C8\uB2E4").addButton((b) => b.setButtonText("\uCE90\uC2DC \uCD08\uAE30\uD654").setWarning().onClick(async () => {
      this.plugin.cachedData.clear();
      await this.plugin.saveData(this.plugin.buildSaveData());
      new import_obsidian.Notice("\uCE90\uC2DC\uAC00 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }));
  }
};
