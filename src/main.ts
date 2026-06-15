import { App, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';

// ===== TYPES =====
interface DailyNoteData {
  date: string;
  checkboxItems: CheckboxItem[];
  checkedCount: number;
  freeText: string;
  conditionScore?: number;
  scoreReason?: string;
  analyzedAt?: number;
}

interface CheckboxItem {
  label: string;
  checked: boolean;
}

interface TrackerSettings {
  anthropicApiKey: string;
  dailyNotesFolder: string;
  conditionSectionHeader: string;
  lastAutoAnalyze?: string;
}

interface CachedStorage {
  settings: TrackerSettings;
  cache: Record<string, DailyNoteData>;
}

const DEFAULT_SETTINGS: TrackerSettings = {
  anthropicApiKey: '',
  dailyNotesFolder: '',
  conditionSectionHeader: '컨디션',
};

const TRACKER_VIEW_TYPE = 'daily-condition-tracker';

// ===== MAIN PLUGIN =====
export default class DailyConditionTracker extends Plugin {
  settings: TrackerSettings = DEFAULT_SETTINGS;
  cachedData: Map<string, DailyNoteData> = new Map();

  async onload() {
    await this.loadSettings();
    this.registerView(TRACKER_VIEW_TYPE, (leaf) => new TrackerView(leaf, this));
    this.addRibbonIcon('activity', '컨디션 트래커', () => this.activateView());
    this.addCommand({
      id: 'open-condition-tracker',
      name: '컨디션 트래커 열기',
      callback: () => this.activateView(),
    });
    this.addSettingTab(new TrackerSettingTab(this.app, this));

    // 1분마다 자동 분석 체크
    this.registerInterval(window.setInterval(() => this.checkAutoAnalyze(), 60 * 1000));
    this.checkAutoAnalyze();
  }

  async checkAutoAnalyze() {
    const now = new Date();
    const today = this.formatDate(now);

    // 오전 5시이고 오늘 아직 자동분석 안 했으면
    if (now.getHours() === 5 && this.settings.lastAutoAnalyze !== today) {
      this.settings.lastAutoAnalyze = today;
      await this.saveData(this.buildSaveData());

      // 어제 날짜 노트 분석
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = this.formatDate(yesterday);

      if (!this.cachedData.has(yesterdayStr) && this.settings.anthropicApiKey) {
        new Notice('컨디션 트래커: 어제 노트를 분석합니다...');
        try {
          await this.analyzeDate(yesterdayStr);
          new Notice('컨디션 트래커: 어제 컨디션 분석 완료!');
        } catch (e) {
          console.error('Auto analyze failed:', e);
        }
      }
    }
  }

  async analyzeDate(dateStr: string) {
    const parser = new DailyNoteParser(this.app, this.settings);
    const file = parser.findFileByDate(dateStr);
    if (!file) return;

    const noteData = await parser.parseNote(file, dateStr);
    if (!noteData) return;

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

  buildSaveData(): CachedStorage {
    const cache: Record<string, DailyNoteData> = {};
    this.cachedData.forEach((v, k) => { cache[k] = v; });
    return { settings: this.settings, cache };
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(TRACKER_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: TRACKER_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    const data = await this.loadData() as CachedStorage | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    if (data?.cache) {
      Object.entries(data.cache).forEach(([k, v]) => this.cachedData.set(k, v));
    }
  }

  async saveSettings() {
    await this.saveData(this.buildSaveData());
  }

  formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

// ===== TRACKER VIEW =====
type ViewMode = 'week' | 'month' | 'year';

class TrackerView extends ItemView {
  plugin: DailyConditionTracker;
  currentView: ViewMode = 'week';
  isAnalyzing = false;
  aiInsightText = '';

  constructor(leaf: WorkspaceLeaf, plugin: DailyConditionTracker) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return TRACKER_VIEW_TYPE; }
  getDisplayText() { return '컨디션 트래커'; }
  getIcon() { return 'activity'; }

  async onOpen() { await this.render(); }

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ct-container');

    // Header
    const header = container.createDiv('ct-header');
    header.createEl('h2', { text: '컨디션 트래커', cls: 'ct-title' });

    const controls = header.createDiv('ct-controls');

    // View tabs
    const tabs = controls.createDiv('ct-tabs');
    const viewLabels: Record<ViewMode, string> = { week: '주간', month: '월간', year: '연간' };
    (['week', 'month', 'year'] as ViewMode[]).forEach((v) => {
      const btn = tabs.createEl('button', {
        text: viewLabels[v],
        cls: `ct-tab ${this.currentView === v ? 'ct-tab--active' : ''}`,
      });
      btn.onclick = async () => { this.currentView = v; await this.render(); };
    });

    // Analyze button
    const analyzeBtn = controls.createEl('button', {
      text: this.isAnalyzing ? '분석 중...' : '분석 시작',
      cls: 'ct-btn-primary',
    });
    analyzeBtn.disabled = this.isAnalyzing;
    analyzeBtn.onclick = () => this.runAnalysis(container);

    // Get data for current view
    const data = await this.getDataForView();
    const withScores = data.filter(d => (d.conditionScore ?? 0) > 0);

    // Stats bar
    if (withScores.length > 0) {
      const stats = container.createDiv('ct-stats');
      const avg = withScores.reduce((s, d) => s + (d.conditionScore ?? 0), 0) / withScores.length;
      const avgChecks = data.reduce((s, d) => s + d.checkedCount, 0) / data.length;
      stats.createDiv({ cls: 'ct-stat', text: `평균 컨디션: ${avg.toFixed(1)}점` });
      stats.createDiv({ cls: 'ct-stat', text: `평균 체크: ${avgChecks.toFixed(1)}개` });
      stats.createDiv({ cls: 'ct-stat', text: `기록 일수: ${data.length}일` });
    }

    // Chart
    const chartArea = container.createDiv('ct-chart-area');
    if (data.length === 0) {
      chartArea.createEl('p', { text: '데이터가 없습니다. 분석 시작 버튼을 눌러주세요.', cls: 'ct-empty' });
    } else {
      this.renderChart(chartArea, data);
    }

    // Insights
    const insightsArea = container.createDiv('ct-insights-area');
    insightsArea.createEl('h3', { text: '인사이트 & 상관관계', cls: 'ct-insights-title' });

    if (withScores.length >= 3) {
      this.renderCorrelations(insightsArea, withScores);

      if (this.aiInsightText) {
        const aiDiv = insightsArea.createDiv('ct-ai-box');
        aiDiv.createEl('h4', { text: '🤖 AI 종합 인사이트' });
        aiDiv.createEl('p', { text: this.aiInsightText });
      } else if (this.plugin.settings.anthropicApiKey && withScores.length >= 5) {
        const aiBtn = insightsArea.createEl('button', { text: 'AI 인사이트 생성', cls: 'ct-btn-secondary' });
        aiBtn.onclick = async () => {
          aiBtn.setText('분석 중...');
          aiBtn.disabled = true;
          try {
            const analyzer = new ClaudeAnalyzer(this.plugin.settings.anthropicApiKey);
            this.aiInsightText = await analyzer.generateInsights(withScores);
            await this.render();
          } catch (e) {
            aiBtn.setText('생성 실패 - 재시도');
            aiBtn.disabled = false;
          }
        };
      }
    } else {
      insightsArea.createEl('p', { text: '인사이트를 표시하려면 3일 이상의 분석 데이터가 필요합니다.', cls: 'ct-empty' });
    }
  }

  async runAnalysis(container: HTMLElement) {
    if (!this.plugin.settings.anthropicApiKey) {
      new Notice('설정에서 Anthropic API 키를 먼저 입력해주세요.');
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
        if (!dateStr) continue;
        if (this.plugin.cachedData.has(dateStr)) { count++; continue; }

        const noteData = await parser.parseNote(file, dateStr);
        if (!noteData) continue;

        if (noteData.freeText.length > 10) {
          try {
            const result = await analyzer.inferConditionScore(noteData.freeText);
            noteData.conditionScore = result.score;
            noteData.scoreReason = result.reason;
            noteData.analyzedAt = Date.now();
          } catch (e) {
            console.error('Score inference failed for', dateStr, e);
          }
        }
        this.plugin.cachedData.set(dateStr, noteData);
        count++;
      }

      await this.plugin.saveData(this.plugin.buildSaveData());
      new Notice(`${count}개 노트 분석 완료`);
    } catch (e) {
      new Notice(`분석 실패: ${(e as Error).message}`);
    } finally {
      this.isAnalyzing = false;
      await this.render();
    }
  }

  getDateRange(): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date(end);
    if (this.currentView === 'week') start.setDate(end.getDate() - 6);
    else if (this.currentView === 'month') start.setDate(end.getDate() - 29);
    else start.setDate(end.getDate() - 364);
    return { start, end };
  }

  async getDataForView(): Promise<DailyNoteData[]> {
    const { start, end } = this.getDateRange();
    const result: DailyNoteData[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const dateStr = this.plugin.formatDate(cur);
      const d = this.plugin.cachedData.get(dateStr);
      if (d) result.push(d);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  renderChart(container: HTMLElement, data: DailyNoteData[]) {
    const wrapper = container.createDiv('ct-chart-wrapper');

    // Y axis
    const yAxis = wrapper.createDiv('ct-y-axis');
    for (let i = 10; i >= 0; i -= 2) {
      yAxis.createDiv({ cls: 'ct-y-label', text: String(i) });
    }

    // Bars
    const chartEl = wrapper.createDiv('ct-chart');
    const barsEl = chartEl.createDiv('ct-bars');

    const displayData = this.currentView === 'year'
      ? this.groupByMonth(data)
      : data.map(d => ({
          label: d.date.slice(5),
          score: d.conditionScore ?? 0,
          checks: d.checkedCount,
          tooltip: d.scoreReason ?? '',
        }));

    displayData.forEach(item => {
      const group = barsEl.createDiv('ct-bar-group');
      const barWrapper = group.createDiv('ct-bar-wrapper');

      const scoreClass = item.score >= 8 ? 'score-excellent'
        : item.score >= 6 ? 'score-good'
        : item.score >= 4 ? 'score-fair'
        : item.score > 0 ? 'score-poor'
        : 'score-none';

      const bar = barWrapper.createDiv(`ct-bar ${scoreClass}`);
      bar.style.height = `${item.score * 10}%`;
      if (item.score > 0) {
        bar.createDiv({ cls: 'ct-bar-score', text: item.score % 1 === 0 ? String(item.score) : item.score.toFixed(1) });
      }
      if (item.tooltip) bar.setAttribute('title', item.tooltip);

      const labelEl = group.createDiv('ct-bar-label');
      labelEl.createDiv({ cls: 'ct-bar-date', text: item.label });
      labelEl.createDiv({ cls: 'ct-bar-checks', text: `✓${item.checks}` });
    });
  }

  groupByMonth(data: DailyNoteData[]): { label: string; score: number; checks: number; tooltip: string }[] {
    const months: Record<string, DailyNoteData[]> = {};
    data.forEach(d => {
      const m = d.date.slice(0, 7);
      if (!months[m]) months[m] = [];
      months[m].push(d);
    });
    return Object.entries(months).map(([month, items]) => {
      const scored = items.filter(i => (i.conditionScore ?? 0) > 0);
      const avgScore = scored.length > 0
        ? scored.reduce((s, i) => s + (i.conditionScore ?? 0), 0) / scored.length
        : 0;
      const avgChecks = items.reduce((s, i) => s + i.checkedCount, 0) / items.length;
      return {
        label: month.slice(5) + '월',
        score: Math.round(avgScore * 10) / 10,
        checks: Math.round(avgChecks),
        tooltip: '',
      };
    });
  }

  renderCorrelations(container: HTMLElement, data: DailyNoteData[]) {
    const allLabels = new Set<string>();
    data.forEach(d => d.checkboxItems.forEach(cb => allLabels.add(cb.label)));

    const correlations: {
      label: string;
      checkedAvg: number;
      uncheckedAvg: number;
      diff: number;
      checkedN: number;
      uncheckedN: number;
    }[] = [];

    allLabels.forEach(label => {
      const checked = data.filter(d => d.checkboxItems.some(cb => cb.label === label && cb.checked));
      const unchecked = data.filter(d => d.checkboxItems.some(cb => cb.label === label && !cb.checked));
      if (checked.length < 2 || unchecked.length < 2) return;

      const checkedAvg = checked.reduce((s, d) => s + (d.conditionScore ?? 0), 0) / checked.length;
      const uncheckedAvg = unchecked.reduce((s, d) => s + (d.conditionScore ?? 0), 0) / unchecked.length;
      correlations.push({
        label,
        checkedAvg,
        uncheckedAvg,
        diff: checkedAvg - uncheckedAvg,
        checkedN: checked.length,
        uncheckedN: unchecked.length,
      });
    });

    correlations.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    if (correlations.length === 0) {
      container.createEl('p', { text: '상관관계 분석을 위한 데이터가 부족합니다.', cls: 'ct-empty' });
      return;
    }

    const grid = container.createDiv('ct-corr-grid');

    correlations.slice(0, 8).forEach(c => {
      const card = grid.createDiv(`ct-corr-card ${c.diff >= 0 ? 'ct-corr-pos' : 'ct-corr-neg'}`);
      card.createDiv({ cls: 'ct-corr-label', text: c.label });
      const diffSign = c.diff >= 0 ? '+' : '';
      card.createDiv({ cls: 'ct-corr-diff', text: `${diffSign}${c.diff.toFixed(1)}` });
      card.createDiv({ cls: 'ct-corr-detail', text: `체크:${c.checkedAvg.toFixed(1)} 미체크:${c.uncheckedAvg.toFixed(1)}` });
    });
  }
}

// ===== DAILY NOTE PARSER =====
class DailyNoteParser {
  constructor(private app: App, private settings: TrackerSettings) {}

  getDailyNoteFiles(startDate: Date, endDate: Date): TFile[] {
    const folder = this.settings.dailyNotesFolder;
    return this.app.vault.getFiles().filter(f => {
      if (f.extension !== 'md') return false;
      if (folder && !f.path.startsWith(folder)) return false;
      const dateStr = this.getDateFromFile(f);
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= startDate && d <= endDate;
    });
  }

  findFileByDate(dateStr: string): TFile | null {
    const folder = this.settings.dailyNotesFolder;
    const files = this.app.vault.getFiles();
    return files.find(f => {
      if (f.extension !== 'md') return false;
      if (folder && !f.path.startsWith(folder)) return false;
      return this.getDateFromFile(f) === dateStr;
    }) ?? null;
  }

  getDateFromFile(file: TFile): string | null {
    const match = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  async parseNote(file: TFile, dateStr: string): Promise<DailyNoteData | null> {
    const content = await this.app.vault.read(file);
    const checkboxItems = this.parseCheckboxes(content);
    const freeText = this.extractFreeText(content);
    return {
      date: dateStr,
      checkboxItems,
      checkedCount: checkboxItems.filter(cb => cb.checked).length,
      freeText,
    };
  }

  parseCheckboxes(content: string): CheckboxItem[] {
    const items: CheckboxItem[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^[-*]\s+\[(x|X| )\]\s+(.+)$/);
      if (match) {
        items.push({ label: match[2].trim(), checked: match[1].toLowerCase() === 'x' });
      }
    }
    return items;
  }

  extractFreeText(content: string): string {
    const header = this.settings.conditionSectionHeader;
    // Find the condition section header and get text BEFORE it
    const sectionIdx = content.search(new RegExp(`(#{1,6}\\s*)?${header}`, 'i'));
    if (sectionIdx > -1) {
      return content.substring(0, sectionIdx).trim();
    }
    // Otherwise remove checkbox lines and return the rest
    return content.split('\n')
      .filter(l => !l.match(/^[-*]\s+\[/))
      .join('\n')
      .trim();
  }
}

// ===== CLAUDE ANALYZER =====
class ClaudeAnalyzer {
  constructor(private apiKey: string) {}

  async inferConditionScore(freeText: string): Promise<{ score: number; reason: string }> {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `다음 일기를 읽고 그날의 전반적 컨디션을 1~10점으로 평가해주세요.
(10=매우좋음, 5=보통, 1=매우나쁨)

일기:
${freeText.substring(0, 1200)}

JSON만 응답: {"score": 숫자, "reason": "한줄이유"}`,
        }],
      }),
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json() as { content: { text: string }[] };
    const text = data.content[0].text.trim();

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(10, Math.max(1, Number(parsed.score))),
          reason: String(parsed.reason ?? ''),
        };
      }
    } catch {
      // fall through to score-only parsing
    }
    const scoreMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (scoreMatch) return { score: parseFloat(scoreMatch[1]), reason: '' };
    throw new Error('응답 파싱 실패');
  }

  async generateInsights(data: DailyNoteData[]): Promise<string> {
    const summary = data.map(d => ({
      날짜: d.date,
      컨디션점수: d.conditionScore,
      체크항목: d.checkboxItems.filter(cb => cb.checked).map(cb => cb.label),
      미체크항목: d.checkboxItems.filter(cb => !cb.checked).map(cb => cb.label),
    }));

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `아래는 나의 일별 컨디션 데이터입니다. 분석해서 친근하게 한국어로 알려주세요:

1. 어떤 항목이 컨디션에 가장 큰 영향을 주는지
2. 발견한 패턴/트렌드
3. 내가 몰랐을 만한 인사이트
4. 실질적인 조언

데이터: ${JSON.stringify(summary)}`,
        }],
      }),
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const result = await resp.json() as { content: { text: string }[] };
    return result.content[0].text;
  }
}

// ===== SETTINGS TAB =====
class TrackerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DailyConditionTracker) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Daily Condition Tracker 설정' });

    new Setting(containerEl)
      .setName('Anthropic API 키')
      .setDesc('Claude API 호출에 사용됩니다 (sk-ant-...)')
      .addText(t => t
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async v => {
          this.plugin.settings.anthropicApiKey = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('데일리노트 폴더')
      .setDesc('데일리노트가 있는 폴더 경로 (비워두면 전체 볼트 검색)')
      .addText(t => t
        .setPlaceholder('Daily Notes')
        .setValue(this.plugin.settings.dailyNotesFolder)
        .onChange(async v => {
          this.plugin.settings.dailyNotesFolder = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('컨디션 섹션 헤더')
      .setDesc('체크박스들이 있는 섹션의 헤더 텍스트')
      .addText(t => t
        .setPlaceholder('컨디션')
        .setValue(this.plugin.settings.conditionSectionHeader)
        .onChange(async v => {
          this.plugin.settings.conditionSectionHeader = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('분석 캐시 초기화')
      .setDesc('저장된 분석 데이터를 삭제하고 처음부터 다시 분석합니다')
      .addButton(b => b
        .setButtonText('캐시 초기화')
        .setWarning()
        .onClick(async () => {
          this.plugin.cachedData.clear();
          await this.plugin.saveData(this.plugin.buildSaveData());
          new Notice('캐시가 초기화되었습니다.');
        }));
  }
}
