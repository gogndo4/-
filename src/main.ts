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
  dailyNotesFolder: string;
  conditionSectionHeader: string;
  lastAutoAnalyze?: string;
}

interface CachedStorage {
  settings: TrackerSettings;
  cache: Record<string, DailyNoteData>;
}

const DEFAULT_SETTINGS: TrackerSettings = {
  dailyNotesFolder: '',
  conditionSectionHeader: '컨디션',
};

const TRACKER_VIEW_TYPE = 'daily-condition-tracker';

// ===== KEYWORD SCORER (로컬, API 불필요) =====
const POS2 = ['최고다','완벽하','너무좋','엄청좋','기분최고','컨디션최고','최상이'];
const POS1 = [
  '좋다','좋아','좋음','좋았','활기','상쾌','기분좋','에너지','즐겁','행복',
  '잘됐','편안','충분','괜찮','산뜻','개운','잘잤','잘먹','힘있','활발',
  '수월','가뿐','의욕','집중잘','뿌듯','활력','열정','생산적','활동적',
];
const NEG2 = ['최악','너무힘들','너무피곤','쓰러질','죽겠'];
const NEG1 = [
  '피곤','힘들','나쁘다','아프다','무기력','졸리다','졸림','힘없','지쳤',
  '두통','스트레스','불안','우울','못잤','못먹','찌뿌','뻐근','무겁',
  '집중안','컨디션나','몸안좋','의욕없','짜증','번아웃','몸살','감기',
];

class KeywordScorer {
  static score(text: string): { score: number; reason: string } {
    const t = text.replace(/\s/g, '');
    let pts = 0;
    const hits: string[] = [];
    for (const w of POS2) if (t.includes(w)) { pts += 2; hits.push(`+${w}`); }
    for (const w of POS1) if (t.includes(w)) { pts += 1; hits.push(`+${w}`); }
    for (const w of NEG2) if (t.includes(w)) { pts -= 2; hits.push(`-${w}`); }
    for (const w of NEG1) if (t.includes(w)) { pts -= 1; hits.push(`-${w}`); }
    const raw = 5.5 + pts * 0.5;
    const score = Math.round(Math.min(10, Math.max(1, raw)) * 2) / 2;
    return {
      score,
      reason: hits.length > 0 ? hits.slice(0, 5).join(', ') : '중립',
    };
  }
}

// ===== MAIN PLUGIN =====
export default class DailyConditionTracker extends Plugin {
  settings: TrackerSettings = { ...DEFAULT_SETTINGS };
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

    // 볼트 로드 완료 후 자동 감지 + 최근 미분석 처리
    this.app.workspace.onLayoutReady(async () => {
      await this.autoDetectSettings();
      await this.checkMissedNotes();
      this.registerInterval(window.setInterval(() => this.checkAutoAnalyze(), 60 * 1000));
    });
  }

  // 데일리노트 폴더 & 컨디션 섹션 헤더 자동 감지
  async autoDetectSettings() {
    const files = this.app.vault.getFiles().filter(f => f.extension === 'md');

    // 1) 날짜 이름 파일이 가장 많은 폴더 찾기
    if (!this.settings.dailyNotesFolder) {
      const counts = new Map<string, number>();
      for (const f of files) {
        if (/^\d{4}-\d{2}-\d{2}/.test(f.basename)) {
          const folder = f.parent?.path ?? '';
          counts.set(folder, (counts.get(folder) ?? 0) + 1);
        }
      }
      let best = ''; let bestN = 0;
      counts.forEach((n, folder) => { if (n > bestN) { bestN = n; best = folder; } });
      this.settings.dailyNotesFolder = best;
    }

    // 2) 체크박스를 포함한 섹션 헤더 찾기 (샘플 파일 3개)
    const folder = this.settings.dailyNotesFolder;
    const samples = files
      .filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.basename) && (!folder || f.path.startsWith(folder)))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 3);

    for (const file of samples) {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      let heading = '';
      for (const line of lines) {
        if (/^#{1,4}\s/.test(line)) heading = line.replace(/^#+\s*/, '').trim();
        if (line.match(/^[-*]\s+\[/) && heading) {
          this.settings.conditionSectionHeader = heading;
          break;
        }
      }
      if (this.settings.conditionSectionHeader !== DEFAULT_SETTINGS.conditionSectionHeader) break;
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
    if (updated) await this.saveData(this.buildSaveData());
  }

  plugin_cachedHas(dateStr: string): boolean {
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

  async analyzeDate(dateStr: string, parser?: DailyNoteParser) {
    const p = parser ?? new DailyNoteParser(this.app, this.settings);
    const file = p.findFileByDate(dateStr);
    if (!file) return;
    const noteData = await p.parseNote(file, dateStr);
    if (!noteData) return;
    if (noteData.freeText.length > 5) {
      const { score, reason } = KeywordScorer.score(noteData.freeText);
      noteData.conditionScore = score;
      noteData.scoreReason = reason;
      noteData.analyzedAt = Date.now();
    }
    this.cachedData.set(dateStr, noteData);
  }

  async analyzeRange(start: Date, end: Date): Promise<number> {
    const parser = new DailyNoteParser(this.app, this.settings);
    const files = parser.getDailyNoteFiles(start, end);
    for (const file of files) {
      const dateStr = parser.getDateFromFile(file);
      if (!dateStr) continue;
      const noteData = await parser.parseNote(file, dateStr);
      if (!noteData) continue;
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

  constructor(leaf: WorkspaceLeaf, plugin: DailyConditionTracker) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return TRACKER_VIEW_TYPE; }
  getDisplayText() { return '컨디션 트래커'; }
  getIcon() { return 'activity'; }

  async onOpen() {
    // 해당 기간 데이터 없으면 자동 분석 후 표시
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
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ct-container');

    // ── 헤더 ──
    const header = container.createDiv('ct-header');
    header.createEl('h2', { text: '컨디션 트래커', cls: 'ct-title' });
    const controls = header.createDiv('ct-controls');

    // 뷰 탭
    const tabs = controls.createDiv('ct-tabs');
    const labels: Record<ViewMode, string> = { week: '주간', month: '월간', year: '연간' };
    (['week', 'month', 'year'] as ViewMode[]).forEach(v => {
      const btn = tabs.createEl('button', {
        text: labels[v],
        cls: `ct-tab${this.currentView === v ? ' ct-tab--active' : ''}`,
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

    // 재분석 버튼
    const reBtn = controls.createEl('button', {
      text: this.isAnalyzing ? '분석 중...' : '재분석',
      cls: 'ct-btn-primary',
    });
    reBtn.disabled = this.isAnalyzing;
    reBtn.onclick = async () => {
      this.isAnalyzing = true;
      await this.render();
      const { start, end } = this.getDateRange();
      const n = await this.plugin.analyzeRange(start, end);
      new Notice(`재분석 완료 (${n}개 노트)`);
      this.isAnalyzing = false;
      await this.render();
    };

    if (this.isAnalyzing) {
      container.createDiv({ cls: 'ct-loading', text: '노트를 분석하는 중입니다...' });
      return;
    }

    const data = await this.getDataForView();
    const withScores = data.filter(d => (d.conditionScore ?? 0) > 0);

    // ── 통계 바 ──
    if (withScores.length > 0) {
      const stats = container.createDiv('ct-stats');
      const avg = withScores.reduce((s, d) => s + (d.conditionScore ?? 0), 0) / withScores.length;
      const avgChecks = data.reduce((s, d) => s + d.checkedCount, 0) / data.length;
      stats.createDiv({ cls: 'ct-stat', text: `평균 컨디션 ${avg.toFixed(1)}점` });
      stats.createDiv({ cls: 'ct-stat', text: `평균 체크 ${avgChecks.toFixed(1)}개` });
      stats.createDiv({ cls: 'ct-stat', text: `기록 ${data.length}일` });
    }

    // ── 차트 ──
    const chartArea = container.createDiv('ct-chart-area');
    if (data.length === 0) {
      const folder = this.plugin.settings.dailyNotesFolder;
      chartArea.createEl('p', {
        text: `이 기간의 데일리노트를 찾지 못했어요. 설정에서 폴더 경로를 확인해주세요 (현재: "${folder || '전체 볼트'}").`,
        cls: 'ct-empty',
      });
    } else {
      this.renderChart(chartArea, data);
    }

    // ── 인사이트 ──
    const insightsArea = container.createDiv('ct-insights-area');
    insightsArea.createEl('h3', { text: '인사이트 & 상관관계', cls: 'ct-insights-title' });
    if (withScores.length >= 3) {
      this.renderCorrelations(insightsArea, withScores);
      this.renderStatInsights(insightsArea, withScores);
    } else {
      insightsArea.createEl('p', { text: '인사이트를 보려면 3일 이상의 기록이 필요해요.', cls: 'ct-empty' });
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
      const d = this.plugin.cachedData.get(this.plugin.formatDate(cur));
      if (d) result.push(d);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  renderChart(container: HTMLElement, data: DailyNoteData[]) {
    const wrapper = container.createDiv('ct-chart-wrapper');
    const yAxis = wrapper.createDiv('ct-y-axis');
    for (let i = 10; i >= 0; i -= 2) {
      yAxis.createDiv({ cls: 'ct-y-label', text: String(i) });
    }
    const chartEl = wrapper.createDiv('ct-chart');
    const barsEl = chartEl.createDiv('ct-bars');

    const display = this.currentView === 'year'
      ? this.groupByMonth(data)
      : data.map(d => ({
          label: d.date.slice(5),
          score: d.conditionScore ?? 0,
          checks: d.checkedCount,
          tooltip: d.scoreReason ?? '',
        }));

    display.forEach(item => {
      const group = barsEl.createDiv('ct-bar-group');
      const barWrapper = group.createDiv('ct-bar-wrapper');
      const cls = item.score >= 8 ? 'score-excellent'
        : item.score >= 6 ? 'score-good'
        : item.score >= 4 ? 'score-fair'
        : item.score > 0 ? 'score-poor' : 'score-none';
      const bar = barWrapper.createDiv(`ct-bar ${cls}`);
      bar.style.height = `${item.score * 10}%`;
      if (item.score > 0) bar.createDiv({ cls: 'ct-bar-score', text: item.score % 1 === 0 ? String(item.score) : item.score.toFixed(1) });
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
      const avg = scored.length > 0 ? scored.reduce((s, i) => s + (i.conditionScore ?? 0), 0) / scored.length : 0;
      return {
        label: month.slice(5) + '월',
        score: Math.round(avg * 10) / 10,
        checks: Math.round(items.reduce((s, i) => s + i.checkedCount, 0) / items.length),
        tooltip: '',
      };
    });
  }

  // 항목별 통계 계산 (공통 헬퍼)
  buildItemStats(data: DailyNoteData[]) {
    const allLabels = new Set<string>();
    data.forEach(d => d.checkboxItems.forEach(cb => allLabels.add(cb.label)));

    const stats: {
      label: string;
      diff: number;
      checkedAvg: number;
      uncheckedAvg: number;
      checkRate: number;
      streak: number;   // 최근 연속 체크 일수
      missed: number;   // 최근 연속 미체크 일수
      hasEnoughData: boolean;
    }[] = [];

    const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));

    allLabels.forEach(label => {
      const withItem = sorted.filter(d => d.checkboxItems.some(cb => cb.label === label));
      const on  = withItem.filter(d => d.checkboxItems.some(cb => cb.label === label && cb.checked));
      const off = withItem.filter(d => d.checkboxItems.some(cb => cb.label === label && !cb.checked));

      let streak = 0, missed = 0, cS = true, cM = true;
      for (const d of withItem) {
        const isOn = d.checkboxItems.some(cb => cb.label === label && cb.checked);
        if (cS) { if (isOn) streak++; else cS = false; }
        if (cM) { if (!isOn) missed++; else cM = false; }
      }

      const onAvg  = on.length  > 0 ? on.reduce((s, d)  => s + (d.conditionScore ?? 0), 0) / on.length  : 0;
      const offAvg = off.length > 0 ? off.reduce((s, d) => s + (d.conditionScore ?? 0), 0) / off.length : 0;

      stats.push({
        label,
        diff: on.length > 0 && off.length > 0 ? onAvg - offAvg : 0,
        checkedAvg: onAvg,
        uncheckedAvg: offAvg,
        checkRate: withItem.length > 0 ? on.length / withItem.length : 0,
        streak,
        missed,
        hasEnoughData: on.length >= 2 && off.length >= 2,
      });
    });

    return stats;
  }

  renderCorrelations(container: HTMLElement, data: DailyNoteData[]) {
    const stats = this.buildItemStats(data).filter(s => s.hasEnoughData);
    if (stats.length === 0) {
      container.createEl('p', { text: '항목별 비교에 데이터가 더 필요해요.', cls: 'ct-empty' });
      return;
    }

    container.createEl('h4', { text: '항목별 컨디션 영향도', cls: 'ct-impact-title' });

    const tiers = [
      { key: 'critical', label: '핵심 습관',       sub: '없으면 컨디션이 크게 떨어져요', items: stats.filter(s => s.diff >= 1.5) },
      { key: 'good',     label: '도움이 되는 습관', sub: '있을 때 더 좋아요',            items: stats.filter(s => s.diff >= 0.4 && s.diff < 1.5) },
      { key: 'neutral',  label: '영향 낮음',         sub: '컨디션과 연관이 적어요',       items: stats.filter(s => Math.abs(s.diff) < 0.4) },
      { key: 'bad',      label: '피하면 좋은 것',    sub: '체크할수록 컨디션이 낮아요',   items: stats.filter(s => s.diff < -0.4) },
    ];

    const maxDiff = Math.max(...stats.map(s => Math.abs(s.diff)), 1);

    tiers.forEach(tier => {
      if (tier.items.length === 0) return;
      const sec = container.createDiv(`ct-tier ct-tier--${tier.key}`);
      const hdr = sec.createDiv('ct-tier-hdr');
      hdr.createEl('span', { text: tier.label, cls: 'ct-tier-name' });
      hdr.createEl('span', { text: tier.sub,   cls: 'ct-tier-sub'  });

      tier.items.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).forEach(item => {
        const row = sec.createDiv('ct-impact-row');

        // 왼쪽: 이름 + 뱃지
        const left = row.createDiv('ct-impact-left');
        left.createEl('span', { text: item.label, cls: 'ct-impact-name' });
        if (item.missed >= 3)
          left.createEl('span', { text: `${item.missed}일 째 미체크`, cls: 'ct-badge ct-badge--warn' });
        else if (item.streak >= 3)
          left.createEl('span', { text: `${item.streak}일 연속`, cls: 'ct-badge ct-badge--good' });

        // 오른쪽: 바 + 수치
        const right = row.createDiv('ct-impact-right');
        const barWrap = right.createDiv('ct-impact-bar-track');
        const bar = barWrap.createDiv(`ct-impact-bar ${item.diff >= 0 ? 'ct-impact-bar--pos' : 'ct-impact-bar--neg'}`);
        bar.style.width = `${Math.round((Math.abs(item.diff) / maxDiff) * 100)}%`;

        const meta = right.createDiv('ct-impact-meta');
        meta.createEl('span', { cls: 'ct-impact-diff', text: `${item.diff >= 0 ? '+' : ''}${item.diff.toFixed(1)}점` });
        meta.createEl('span', { cls: 'ct-impact-rate', text: `체크율 ${Math.round(item.checkRate * 100)}%` });
      });
    });
  }

  renderStatInsights(container: HTMLElement, data: DailyNoteData[]) {
    if (data.length < 5) return;

    const stats = this.buildItemStats(data).filter(s => s.hasEnoughData);
    const scores = data.map(d => d.conditionScore ?? 0).filter(s => s > 0);
    const mid = Math.floor(scores.length / 2);
    const recentAvg = scores.slice(mid).reduce((s, v) => s + v, 0) / Math.max(scores.length - mid, 1);
    const earlyAvg  = scores.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1);
    const trend = recentAvg - earlyAvg;

    const sorted = [...stats].sort((a, b) => b.diff - a.diff);
    const lacking   = sorted.filter(s => s.diff > 0.5 && s.missed >= 2);
    const goingWell = sorted.filter(s => s.diff > 0.3 && (s.streak >= 3 || s.checkRate > 0.65));
    const topItem   = sorted[0];

    const wrap = container.createDiv('ct-narrative-wrap');

    // ── 카드 1: 최근 부족한 것 ──
    const c1 = wrap.createDiv('ct-narrative-card ct-narrative-card--lack');
    c1.createDiv({ cls: 'ct-narrative-icon', text: '🔴' });
    c1.createEl('h4', { cls: 'ct-narrative-heading', text: '최근 부족한 것' });
    const b1 = c1.createDiv('ct-narrative-body');

    if (lacking.length === 0 && trend >= -0.3) {
      b1.createEl('p', { text: '특별히 빠진 항목이 없어요. 균형 있게 잘 유지하고 있어요.' });
    } else {
      lacking.slice(0, 2).forEach(s => {
        b1.createEl('p', { text: `"${s.label}"이 ${s.missed}일 연속 빠져있어요. 없는 날 컨디션이 평균 ${s.diff.toFixed(1)}점 낮아요.` });
      });
      if (trend < -0.5)
        b1.createEl('p', { text: `전반적으로 컨디션이 이전보다 ${Math.abs(trend).toFixed(1)}점 낮아졌어요.` });
    }

    // ── 카드 2: 잘 하고 있는 것 ──
    const c2 = wrap.createDiv('ct-narrative-card ct-narrative-card--good');
    c2.createDiv({ cls: 'ct-narrative-icon', text: '✅' });
    c2.createEl('h4', { cls: 'ct-narrative-heading', text: '잘 하고 있는 것' });
    const b2 = c2.createDiv('ct-narrative-body');

    if (goingWell.length === 0) {
      b2.createEl('p', { text: '아직 꾸준한 항목이 많지 않아요. 데이터가 더 쌓이면 보여요.' });
    } else {
      goingWell.slice(0, 2).forEach(s => {
        if (s.streak >= 3)
          b2.createEl('p', { text: `"${s.label}"을 ${s.streak}일 연속 챙기고 있어요! 컨디션에 ${s.diff.toFixed(1)}점 기여해요.` });
        else
          b2.createEl('p', { text: `"${s.label}" 체크율이 ${Math.round(s.checkRate * 100)}%로 꾸준해요. 컨디션에 ${s.diff.toFixed(1)}점 영향을 줘요.` });
      });
      if (trend > 0.5)
        b2.createEl('p', { text: `전반적으로 컨디션이 이전보다 ${trend.toFixed(1)}점 올라가는 중이에요.` });
    }

    // ── 카드 3: 앞으로 어떻게 ──
    const c3 = wrap.createDiv('ct-narrative-card ct-narrative-card--advice');
    c3.createDiv({ cls: 'ct-narrative-icon', text: '💡' });
    c3.createEl('h4', { cls: 'ct-narrative-heading', text: '이렇게 해보세요' });
    const b3 = c3.createDiv('ct-narrative-body');

    const advLines: string[] = [];
    if (lacking.length > 0)
      advLines.push(`오늘부터 "${lacking[0].label}"을 다시 챙겨보세요. 컨디션이 빠르게 회복될 수 있어요.`);
    if (topItem && topItem.diff >= 1.0)
      advLines.push(`가장 핵심은 "${topItem.label}"이에요. 다른 게 힘들더라도 이것만은 지켜봐요.`);
    const lowImpact = stats.filter(s => Math.abs(s.diff) < 0.3);
    if (lowImpact.length >= 2)
      advLines.push(`"${lowImpact.slice(0, 2).map(s => s.label).join('", "')}"은 컨디션 영향이 작아요. 에너지를 핵심 항목에 집중해보는 것도 좋아요.`);
    if (advLines.length === 0)
      advLines.push('기록을 계속 쌓아가세요. 2주 이상의 데이터가 모이면 훨씬 구체적인 조언을 드릴 수 있어요.');

    advLines.forEach(l => b3.createEl('p', { text: l }));
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
      const d = this.getDateFromFile(f);
      if (!d) return false;
      const dt = new Date(d);
      return dt >= startDate && dt <= endDate;
    });
  }

  findFileByDate(dateStr: string): TFile | null {
    const folder = this.settings.dailyNotesFolder;
    return this.app.vault.getFiles().find(f => {
      if (f.extension !== 'md') return false;
      if (folder && !f.path.startsWith(folder)) return false;
      return this.getDateFromFile(f) === dateStr;
    }) ?? null;
  }

  getDateFromFile(file: TFile): string | null {
    const m = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }

  async parseNote(file: TFile, dateStr: string): Promise<DailyNoteData | null> {
    const content = await this.app.vault.read(file);
    const checkboxItems = this.parseCheckboxes(content);
    const freeText = this.extractFreeText(content);
    return { date: dateStr, checkboxItems, checkedCount: checkboxItems.filter(cb => cb.checked).length, freeText };
  }

  parseCheckboxes(content: string): CheckboxItem[] {
    const items: CheckboxItem[] = [];
    for (const line of content.split('\n')) {
      const m = line.match(/^[-*]\s+\[(x|X| )\]\s+(.+)$/);
      if (m) items.push({ label: m[2].trim(), checked: m[1].toLowerCase() === 'x' });
    }
    return items;
  }

  extractFreeText(content: string): string {
    const header = this.settings.conditionSectionHeader;
    const idx = content.search(new RegExp(`(#{1,6}\\s*)?${header}`, 'i'));
    if (idx > -1) return content.substring(0, idx).trim();
    return content.split('\n').filter(l => !l.match(/^[-*]\s+\[/)).join('\n').trim();
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

    const info = containerEl.createDiv('ct-settings-info');
    info.createEl('p', { text: `자동 감지 결과 — 폴더: "${this.plugin.settings.dailyNotesFolder || '전체 볼트'}" / 섹션: "${this.plugin.settings.conditionSectionHeader}"` });

    new Setting(containerEl)
      .setName('데일리노트 폴더')
      .setDesc('자동 감지됩니다. 맞지 않으면 직접 입력 (예: Daily Notes)')
      .addText(t => t
        .setPlaceholder('Daily Notes')
        .setValue(this.plugin.settings.dailyNotesFolder)
        .onChange(async v => { this.plugin.settings.dailyNotesFolder = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('컨디션 섹션 헤더')
      .setDesc('체크박스가 속한 헤더 텍스트 (자동 감지)')
      .addText(t => t
        .setPlaceholder('컨디션')
        .setValue(this.plugin.settings.conditionSectionHeader)
        .onChange(async v => { this.plugin.settings.conditionSectionHeader = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('자동 감지 재실행')
      .setDesc('볼트를 다시 스캔해 폴더/헤더를 찾습니다')
      .addButton(b => b.setButtonText('재감지').onClick(async () => {
        this.plugin.settings.dailyNotesFolder = '';
        await this.plugin.autoDetectSettings();
        this.display();
        new Notice(`폴더: ${this.plugin.settings.dailyNotesFolder || '전체'} / 헤더: ${this.plugin.settings.conditionSectionHeader}`);
      }));

    new Setting(containerEl)
      .setName('캐시 초기화')
      .setDesc('저장된 분석을 지우고 트래커 열 때 재분석합니다')
      .addButton(b => b.setButtonText('초기화').setWarning().onClick(async () => {
        this.plugin.cachedData.clear();
        await this.plugin.saveData(this.plugin.buildSaveData());
        new Notice('초기화 완료. 트래커를 다시 열면 자동으로 재분석됩니다.');
      }));
  }
}
