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
  anthropicApiKey: "",
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
      await this.saveData(this.buildSaveData());
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = this.formatDate(yesterday);
      if (!this.cachedData.has(yesterdayStr) && this.settings.anthropicApiKey) {
        new import_obsidian.Notice("\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4: \uC5B4\uC81C \uB178\uD2B8\uB97C \uBD84\uC11D\uD569\uB2C8\uB2E4...");
        try {
          await this.analyzeDate(yesterdayStr);
          new import_obsidian.Notice("\uCEE8\uB514\uC158 \uD2B8\uB798\uCEE4: \uC5B4\uC81C \uCEE8\uB514\uC158 \uBD84\uC11D \uC644\uB8CC!");
        } catch (e) {
          console.error("Auto analyze failed:", e);
        }
      }
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
    if (noteData.freeText.length > 10 && this.settings.anthropicApiKey) {
      const analyzer = new ClaudeAnalyzer(this.settings.anthropicApiKey);
      const result = await analyzer.inferConditionScore(noteData.freeText);
      noteData.conditionScore = result.score;
      noteData.scoreReason = result.reason;
      noteData.analyzedAt = Date.now();
    }
    this.cachedData.set(dateStr, noteData);
    await this.saveData(this.buildSaveData());
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
    this.aiInsightText = "";
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
      if (this.aiInsightText) {
        const aiDiv = insightsArea.createDiv("ct-ai-box");
        aiDiv.createEl("h4", { text: "\u{1F916} AI \uC885\uD569 \uC778\uC0AC\uC774\uD2B8" });
        aiDiv.createEl("p", { text: this.aiInsightText });
      } else if (this.plugin.settings.anthropicApiKey && withScores.length >= 5) {
        const aiBtn = insightsArea.createEl("button", { text: "AI \uC778\uC0AC\uC774\uD2B8 \uC0DD\uC131", cls: "ct-btn-secondary" });
        aiBtn.onclick = async () => {
          aiBtn.setText("\uBD84\uC11D \uC911...");
          aiBtn.disabled = true;
          try {
            const analyzer = new ClaudeAnalyzer(this.plugin.settings.anthropicApiKey);
            this.aiInsightText = await analyzer.generateInsights(withScores);
            await this.render();
          } catch (e) {
            aiBtn.setText("\uC0DD\uC131 \uC2E4\uD328 - \uC7AC\uC2DC\uB3C4");
            aiBtn.disabled = false;
          }
        };
      }
    } else {
      insightsArea.createEl("p", { text: "\uC778\uC0AC\uC774\uD2B8\uB97C \uD45C\uC2DC\uD558\uB824\uBA74 3\uC77C \uC774\uC0C1\uC758 \uBD84\uC11D \uB370\uC774\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.", cls: "ct-empty" });
    }
  }
  async runAnalysis(container) {
    if (!this.plugin.settings.anthropicApiKey) {
      new import_obsidian.Notice("\uC124\uC815\uC5D0\uC11C Anthropic API \uD0A4\uB97C \uBA3C\uC800 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      return;
    }
    this.isAnalyzing = true;
    await this.render();
    try {
      const parser = new DailyNoteParser(this.app, this.plugin.settings);
      const analyzer = new ClaudeAnalyzer(this.plugin.settings.anthropicApiKey);
      const { start, end } = this.getDateRange();
      const files = parser.getDailyNoteFiles(start, end);
      let count = 0;
      for (const file of files) {
        const dateStr = parser.getDateFromFile(file);
        if (!dateStr)
          continue;
        if (this.plugin.cachedData.has(dateStr)) {
          count++;
          continue;
        }
        const noteData = await parser.parseNote(file, dateStr);
        if (!noteData)
          continue;
        if (noteData.freeText.length > 10) {
          try {
            const result = await analyzer.inferConditionScore(noteData.freeText);
            noteData.conditionScore = result.score;
            noteData.scoreReason = result.reason;
            noteData.analyzedAt = Date.now();
          } catch (e) {
            console.error("Score inference failed for", dateStr, e);
          }
        }
        this.plugin.cachedData.set(dateStr, noteData);
        count++;
      }
      await this.plugin.saveData(this.plugin.buildSaveData());
      new import_obsidian.Notice(`${count}\uAC1C \uB178\uD2B8 \uBD84\uC11D \uC644\uB8CC`);
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
var ClaudeAnalyzer = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  async inferConditionScore(freeText) {
    var _a;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: `\uB2E4\uC74C \uC77C\uAE30\uB97C \uC77D\uACE0 \uADF8\uB0A0\uC758 \uC804\uBC18\uC801 \uCEE8\uB514\uC158\uC744 1~10\uC810\uC73C\uB85C \uD3C9\uAC00\uD574\uC8FC\uC138\uC694.
(10=\uB9E4\uC6B0\uC88B\uC74C, 5=\uBCF4\uD1B5, 1=\uB9E4\uC6B0\uB098\uC068)

\uC77C\uAE30:
${freeText.substring(0, 1200)}

JSON\uB9CC \uC751\uB2F5: {"score": \uC22B\uC790, "reason": "\uD55C\uC904\uC774\uC720"}`
        }]
      })
    });
    if (!resp.ok)
      throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    const text = data.content[0].text.trim();
    try {
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(10, Math.max(1, Number(parsed.score))),
          reason: String((_a = parsed.reason) != null ? _a : "")
        };
      }
    } catch (e) {
    }
    const scoreMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (scoreMatch)
      return { score: parseFloat(scoreMatch[1]), reason: "" };
    throw new Error("\uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328");
  }
  async generateInsights(data) {
    const summary = data.map((d) => ({
      \uB0A0\uC9DC: d.date,
      \uCEE8\uB514\uC158\uC810\uC218: d.conditionScore,
      \uCCB4\uD06C\uD56D\uBAA9: d.checkboxItems.filter((cb) => cb.checked).map((cb) => cb.label),
      \uBBF8\uCCB4\uD06C\uD56D\uBAA9: d.checkboxItems.filter((cb) => !cb.checked).map((cb) => cb.label)
    }));
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1e3,
        messages: [{
          role: "user",
          content: `\uC544\uB798\uB294 \uB098\uC758 \uC77C\uBCC4 \uCEE8\uB514\uC158 \uB370\uC774\uD130\uC785\uB2C8\uB2E4. \uBD84\uC11D\uD574\uC11C \uCE5C\uADFC\uD558\uAC8C \uD55C\uAD6D\uC5B4\uB85C \uC54C\uB824\uC8FC\uC138\uC694:

1. \uC5B4\uB5A4 \uD56D\uBAA9\uC774 \uCEE8\uB514\uC158\uC5D0 \uAC00\uC7A5 \uD070 \uC601\uD5A5\uC744 \uC8FC\uB294\uC9C0
2. \uBC1C\uACAC\uD55C \uD328\uD134/\uD2B8\uB80C\uB4DC
3. \uB0B4\uAC00 \uBAB0\uB790\uC744 \uB9CC\uD55C \uC778\uC0AC\uC774\uD2B8
4. \uC2E4\uC9C8\uC801\uC778 \uC870\uC5B8

\uB370\uC774\uD130: ${JSON.stringify(summary)}`
        }]
      })
    });
    if (!resp.ok)
      throw new Error(`API ${resp.status}`);
    const result = await resp.json();
    return result.content[0].text;
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
    new import_obsidian.Setting(containerEl).setName("Anthropic API \uD0A4").setDesc("Claude API \uD638\uCD9C\uC5D0 \uC0AC\uC6A9\uB429\uB2C8\uB2E4 (sk-ant-...)").addText((t) => t.setPlaceholder("sk-ant-...").setValue(this.plugin.settings.anthropicApiKey).onChange(async (v) => {
      this.plugin.settings.anthropicApiKey = v;
      await this.plugin.saveSettings();
    }));
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
