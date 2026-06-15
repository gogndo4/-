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

// ===== NOTE FEATURE EXTRACTOR =====
interface NoteFeatures {
  sleepHours?: number;
  activities: string[];
  hasOutdoor: boolean;
  hasSocial: boolean;
  stressCount: number;
  hasMeal: boolean;
  productiveKw: string[];
}

const ACTIVITY_KW   = ['운동','헬스','조깅','달리기','수영','자전거','요가','산책','등산','필라테스','스트레칭','홈트','gym','workout'];
const OUTDOOR_KW    = ['산책','등산','야외','외출','공원','자연'];
const SOCIAL_KW     = ['친구','약속','만남','대화','모임','함께','같이','커피'];
const STRESS_KW     = ['스트레스','바빴','마감','야근','회의','미팅','힘들었','지쳤','피곤했'];
const MEAL_KW       = ['아침','점심','저녁','식사','밥먹','밥을 먹','먹었다'];
const PRODUCTIVE_KW = ['완료','끝냈','작업','공부','집중','생산','성취','달성'];

class NoteFeatureExtractor {
  static extract(text: string): NoteFeatures {
    const t = text;

    // 수면 시간 파싱: "7시간 수면", "수면 6.5시간", "6시간 잠" 등
    let sleepHours: number | undefined;
    const sleepPats = [
      /([0-9]+(?:\.[05])?)\s*시간\s*(?:수면|잠|잤|자고|취침)/,
      /(?:수면|취침)\s*([0-9]+(?:\.[05])?)\s*시간/,
      /잠을?\s*([0-9]+(?:\.[05])?)\s*시간/,
    ];
    for (const p of sleepPats) {
      const m = t.match(p);
      if (m) { sleepHours = parseFloat(m[1]); break; }
    }

    return {
      sleepHours,
      activities:    ACTIVITY_KW.filter(kw => t.includes(kw)),
      hasOutdoor:    OUTDOOR_KW.some(kw => t.includes(kw)),
      hasSocial:     SOCIAL_KW.some(kw => t.includes(kw)),
      stressCount:   STRESS_KW.filter(kw => t.includes(kw)).length,
      hasMeal:       MEAL_KW.some(kw => t.includes(kw)),
      productiveKw:  PRODUCTIVE_KW.filter(kw => t.includes(kw)),
    };
  }
}

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
      pct: number;          // 미체크 대비 개선율 (%)
      checkedAvg: number;
      uncheckedAvg: number;
      checkRate: number;
      streak: number;
      missed: number;
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
      const diff   = on.length > 0 && off.length > 0 ? onAvg - offAvg : 0;
      // % 변화: 미체크 기준, 분모 최소 1 보장
      const pct    = offAvg > 0.5 ? Math.round((diff / offAvg) * 100) : Math.round(diff * 10);

      stats.push({
        label, diff, pct,
        checkedAvg: onAvg,
        uncheckedAvg: offAvg,
        checkRate: withItem.length > 0 ? on.length / withItem.length : 0,
        streak, missed,
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
      { key: 'critical', label: '핵심 습관',       sub: '없으면 컨디션이 크게 달라져요', items: stats.filter(s => s.diff >= 1.5) },
      { key: 'good',     label: '도움이 되는 습관', sub: '있을 때 눈에 띄게 좋아요',      items: stats.filter(s => s.diff >= 0.4 && s.diff < 1.5) },
      { key: 'neutral',  label: '영향 낮음',         sub: '컨디션과 연관이 적어요',         items: stats.filter(s => Math.abs(s.diff) < 0.4) },
      { key: 'bad',      label: '피하면 좋은 것',    sub: '있을 때 오히려 낮아지는 경향',   items: stats.filter(s => s.diff < -0.4) },
    ];

    const maxPct = Math.max(...stats.map(s => Math.abs(s.pct)), 1);

    tiers.forEach(tier => {
      if (tier.items.length === 0) return;
      const sec = container.createDiv(`ct-tier ct-tier--${tier.key}`);
      const hdr = sec.createDiv('ct-tier-hdr');
      hdr.createEl('span', { text: tier.label, cls: 'ct-tier-name' });
      hdr.createEl('span', { text: tier.sub,   cls: 'ct-tier-sub'  });

      tier.items.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).forEach(item => {
        const row = sec.createDiv('ct-impact-row');

        const left = row.createDiv('ct-impact-left');
        left.createEl('span', { text: item.label, cls: 'ct-impact-name' });
        if (item.missed >= 3)
          left.createEl('span', { text: `${item.missed}일째 미체크`, cls: 'ct-badge ct-badge--warn' });
        else if (item.streak >= 3)
          left.createEl('span', { text: `${item.streak}일 연속`, cls: 'ct-badge ct-badge--good' });

        const right = row.createDiv('ct-impact-right');
        const barWrap = right.createDiv('ct-impact-bar-track');
        const bar = barWrap.createDiv(`ct-impact-bar ${item.diff >= 0 ? 'ct-impact-bar--pos' : 'ct-impact-bar--neg'}`);
        bar.style.width = `${Math.round((Math.abs(item.pct) / maxPct) * 100)}%`;

        const meta = right.createDiv('ct-impact-meta');
        // % 언어로 표시
        const absPct = Math.abs(item.pct);
        const pctLabel = item.diff >= 0
          ? `컨디션 ${absPct}% 더 좋음`
          : `컨디션 ${absPct}% 더 낮음`;
        meta.createEl('span', { cls: `ct-impact-diff ${item.diff >= 0 ? 'pos' : 'neg'}`, text: pctLabel });
        meta.createEl('span', { cls: 'ct-impact-rate', text: `체크율 ${Math.round(item.checkRate * 100)}%` });
      });
    });
  }

  renderStatInsights(container: HTMLElement, data: DailyNoteData[]) {
    if (data.length < 5) return;

    const itemStats = this.buildItemStats(data).filter(s => s.hasEnoughData);
    const sortedItems = [...itemStats].sort((a, b) => b.diff - a.diff);

    // 스코어 추세 (최근 3일 vs 초반 3일)
    const withScore = [...data].filter(d => (d.conditionScore ?? 0) > 0)
                               .sort((a, b) => a.date.localeCompare(b.date));
    const recent3   = withScore.slice(-3).map(d => d.conditionScore ?? 0);
    const early3    = withScore.slice(0, 3).map(d => d.conditionScore ?? 0);
    const recentAvg = recent3.length > 0 ? recent3.reduce((s, v) => s + v, 0) / recent3.length : 0;
    const earlyAvg  = early3.length  > 0 ? early3.reduce((s, v) => s + v, 0)  / early3.length  : 0;
    const trendPct  = earlyAvg > 0 ? Math.round(((recentAvg - earlyAvg) / earlyAvg) * 100) : 0;

    // 노트 피처 분석
    const allFeat = withScore.map(d => ({ score: d.conditionScore ?? 0, f: NoteFeatureExtractor.extract(d.freeText) }));

    // 수면 시간 상관
    const withSleep = allFeat.filter(x => x.f.sleepHours !== undefined);
    let sleepInsight = '';
    if (withSleep.length >= 3) {
      const enough = withSleep.filter(x => (x.f.sleepHours ?? 0) >= 7);
      const lack   = withSleep.filter(x => (x.f.sleepHours ?? 0) < 7);
      if (enough.length >= 2 && lack.length >= 2) {
        const eAvg = enough.reduce((s, x) => s + x.score, 0) / enough.length;
        const lAvg = lack.reduce((s, x) => s + x.score, 0) / lack.length;
        const pct  = lAvg > 0 ? Math.round(((eAvg - lAvg) / lAvg) * 100) : 0;
        if (Math.abs(pct) > 5)
          sleepInsight = pct > 0
            ? `7시간 이상 잔 날 컨디션이 ${pct}% 더 좋았어요.`
            : `수면 시간보다 수면 질을 살펴봐요. 긴 수면이 오히려 낮은 경향이 있어요.`;
      }
    }

    // 활동량 상관
    const withAct = allFeat.filter(x => x.f.activities.length > 0);
    const noAct   = allFeat.filter(x => x.f.activities.length === 0);
    let actInsight = '';
    if (withAct.length >= 2 && noAct.length >= 2) {
      const aAvg = withAct.reduce((s, x) => s + x.score, 0) / withAct.length;
      const nAvg = noAct.reduce((s, x) => s + x.score, 0) / noAct.length;
      const pct  = nAvg > 0 ? Math.round(((aAvg - nAvg) / nAvg) * 100) : 0;
      if (pct > 5) {
        const acts = ACTIVITY_KW.filter(k => withAct.some(x => x.f.activities.includes(k))).slice(0, 2);
        actInsight = `활동(${acts.join(', ')})이 있는 날 컨디션이 ${pct}% 더 높아요.`;
      }
    }

    // 스트레스 상관
    const hiStress = allFeat.filter(x => x.f.stressCount >= 2);
    const loStress = allFeat.filter(x => x.f.stressCount === 0);
    let stressInsight = '';
    if (hiStress.length >= 2 && loStress.length >= 2) {
      const hAvg = hiStress.reduce((s, x) => s + x.score, 0) / hiStress.length;
      const lAvg = loStress.reduce((s, x) => s + x.score, 0) / loStress.length;
      const pct  = hAvg > 0 ? Math.round(((lAvg - hAvg) / hAvg) * 100) : 0;
      if (pct > 10) stressInsight = `스트레스가 많은 날 컨디션이 ${pct}% 낮았어요. 업무 강도 조절이 도움이 될 수 있어요.`;
    }

    // 야외 상관
    const withOut = allFeat.filter(x => x.f.hasOutdoor);
    const noOut   = allFeat.filter(x => !x.f.hasOutdoor);
    let outdoorInsight = '';
    if (withOut.length >= 2 && noOut.length >= 2) {
      const oAvg = withOut.reduce((s, x) => s + x.score, 0) / withOut.length;
      const iAvg = noOut.reduce((s, x) => s + x.score, 0) / noOut.length;
      const pct  = iAvg > 0 ? Math.round(((oAvg - iAvg) / iAvg) * 100) : 0;
      if (pct > 5) outdoorInsight = `야외 활동이 있는 날 컨디션이 ${pct}% 더 좋았어요.`;
    }

    const lacking   = sortedItems.filter(s => s.diff > 0.5 && s.missed >= 2);
    const goingWell = sortedItems.filter(s => s.diff > 0.3 && (s.streak >= 3 || s.checkRate > 0.65));
    const topItem   = sortedItems[0];
    const lowItems  = itemStats.filter(s => Math.abs(s.pct) < 15);

    const wrap = container.createDiv('ct-narrative-wrap');

    // ── 카드 1: 최근 부족한 것 ──
    const c1 = wrap.createDiv('ct-narrative-card ct-narrative-card--lack');
    c1.createDiv({ cls: 'ct-narrative-icon', text: '🔴' });
    c1.createEl('h4', { cls: 'ct-narrative-heading', text: '최근 부족한 것' });
    const b1 = c1.createDiv('ct-narrative-body');
    const lack1: string[] = [];
    lacking.slice(0, 2).forEach(s =>
      lack1.push(`"${s.label}"이 ${s.missed}일 연속 빠져있어요. 없는 날 컨디션이 ${Math.abs(s.pct)}% 더 낮아요.`));
    if (trendPct < -10) lack1.push(`최근 3일 컨디션이 이전 대비 ${Math.abs(trendPct)}% 낮아졌어요.`);
    if (stressInsight)  lack1.push(stressInsight);
    if (lack1.length === 0) lack1.push('최근 빠진 핵심 항목이 없어요. 균형 있게 잘 유지하고 있어요!');
    lack1.forEach(l => b1.createEl('p', { text: l }));

    // ── 카드 2: 잘 하고 있는 것 ──
    const c2 = wrap.createDiv('ct-narrative-card ct-narrative-card--good');
    c2.createDiv({ cls: 'ct-narrative-icon', text: '✅' });
    c2.createEl('h4', { cls: 'ct-narrative-heading', text: '잘 하고 있는 것' });
    const b2 = c2.createDiv('ct-narrative-body');
    const good2: string[] = [];
    goingWell.slice(0, 2).forEach(s => {
      if (s.streak >= 3)
        good2.push(`"${s.label}"을 ${s.streak}일 연속 챙기고 있어요. 있는 날 컨디션이 ${Math.abs(s.pct)}% 더 높아요.`);
      else
        good2.push(`"${s.label}" 체크율이 ${Math.round(s.checkRate * 100)}%로 꾸준해요.`);
    });
    if (actInsight)    good2.push(actInsight);
    if (outdoorInsight) good2.push(outdoorInsight);
    if (trendPct > 10) good2.push(`최근 3일 컨디션이 이전 대비 ${trendPct}% 올라가는 중이에요.`);
    if (good2.length === 0) good2.push('꾸준히 기록을 쌓으면 패턴이 보일 거예요!');
    good2.forEach(l => b2.createEl('p', { text: l }));

    // ── 카드 3: 이렇게 해보세요 ──
    const c3 = wrap.createDiv('ct-narrative-card ct-narrative-card--advice');
    c3.createDiv({ cls: 'ct-narrative-icon', text: '💡' });
    c3.createEl('h4', { cls: 'ct-narrative-heading', text: '이렇게 해보세요' });
    const b3 = c3.createDiv('ct-narrative-body');
    const adv3: string[] = [];
    if (lacking.length > 0)
      adv3.push(`오늘 "${lacking[0].label}"을 다시 챙겨보세요. 내일 컨디션 회복에 바로 영향을 줄 수 있어요.`);
    if (topItem && topItem.diff >= 1.0)
      adv3.push(`가장 핵심은 "${topItem.label}"이에요. 다른 게 힘들어도 이것 하나만은 지켜봐요.`);
    if (sleepInsight)   adv3.push(sleepInsight);
    if (stressInsight && !adv3.some(l => l.includes('스트레스'))) adv3.push(stressInsight);
    if (lowItems.length >= 2)
      adv3.push(`"${lowItems.slice(0, 2).map(s => s.label).join('", "')}"은 컨디션 영향이 15% 미만이에요. 핵심 항목에 에너지를 더 쏟아봐요.`);
    if (adv3.length === 0)
      adv3.push('기록이 2주 이상 쌓이면 더 구체적인 조언을 드릴 수 있어요. 계속 써주세요!');
    adv3.forEach(l => b3.createEl('p', { text: l }));
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
