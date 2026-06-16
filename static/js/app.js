/**
 * CareerSync AI — フロントエンド
 *
 * 同一オリジン（FastAPI）の REST API を fetch で呼び出し、
 * 企業リスト・詳細・レーダーチャートを動的に描画する。
 */

// ── 定数 ──────────────────────────────────────────────────────────────────

const STATUS_LIST = ['検討中', '書類応募', '1次面接', '2次面接', '最終面接', '内定', '辞退'];

const STATUS_STYLE = {
  '検討中':   'bg-gray-100 text-gray-600',
  '書類応募': 'bg-blue-100 text-blue-700',
  '1次面接':  'bg-yellow-100 text-yellow-700',
  '2次面接':  'bg-orange-100 text-orange-700',
  '最終面接': 'bg-red-100 text-red-700',
  '内定':     'bg-green-100 text-green-700',
  '辞退':     'bg-gray-200 text-gray-500',
};

// ── アプリ状態 ────────────────────────────────────────────────────────────

const state = {
  companies: [],
  selectedId: null,
  filterStatus: 'all',
  radarChart: null,
};

// ── API ──────────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ── 初期化 ────────────────────────────────────────────────────────────────

async function init() {
  renderStatusFilters();
  await loadCompanies();
}

// ── 企業リスト ────────────────────────────────────────────────────────────

async function loadCompanies() {
  const query = state.filterStatus !== 'all'
    ? `?status=${encodeURIComponent(state.filterStatus)}`
    : '';
  state.companies = await api('/api/companies' + query);
  renderCompanyList();
  document.getElementById('company-count').textContent = `${state.companies.length}社`;
}

function renderStatusFilters() {
  const nav = document.getElementById('status-filters');
  const items = [['all', '全て'], ...STATUS_LIST.map(s => [s, s])];
  nav.innerHTML = items.map(([val, label]) => `
    <button class="filter-btn text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors
      ${state.filterStatus === val
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
      data-status="${val}">${label}</button>
  `).join('');

  nav.querySelectorAll('.filter-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.filterStatus = btn.dataset.status;
      renderStatusFilters();
      loadCompanies();
    })
  );
}

function renderCompanyList() {
  const list = document.getElementById('company-list');

  if (!state.companies.length) {
    list.innerHTML = `
      <div class="text-center text-gray-400 text-sm py-10">
        <p>企業が登録されていません</p>
        <p class="mt-1 text-xs">「企業を追加」から始めましょう</p>
      </div>`;
    return;
  }

  list.innerHTML = state.companies.map(c => {
    const badge = STATUS_STYLE[c.status] || 'bg-gray-100 text-gray-600';
    const sel = c.id === state.selectedId;
    const analyzed = c.scores !== null;
    return `
      <div class="company-card p-3 rounded-xl border cursor-pointer transition-all
        ${sel
          ? 'bg-indigo-50 border-indigo-300 shadow-sm'
          : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30'}"
        data-id="${c.id}">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium text-sm truncate">${c.name || '(名称未取得)'}</span>
          <span class="text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge}">${c.status}</span>
        </div>
        <div class="text-xs text-gray-400 mt-0.5 truncate">${c.url}</div>
        <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
          ${c.hiring_probability_score ? `<span>採用 <b>${c.hiring_probability_score}</b>/10</span>` : ''}
          ${c.expected_first_salary   ? `<span>💴 ${c.expected_first_salary}万</span>` : ''}
          ${!analyzed ? '<span class="text-orange-400 font-medium">未分析</span>' : ''}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.company-card').forEach(card =>
    card.addEventListener('click', () => selectCompany(parseInt(card.dataset.id)))
  );
}

// ── 企業詳細 ──────────────────────────────────────────────────────────────

async function selectCompany(id) {
  state.selectedId = id;
  renderCompanyList();
  const company = await api(`/api/companies/${id}`);
  renderDetail(company);
}

function renderDetail(c) {
  document.getElementById('empty-state').classList.add('hidden');
  const el = document.getElementById('company-detail');
  el.classList.remove('hidden');

  const analyzed    = c.scores !== null;
  const scores      = parseJSON(c.scores);
  const sw          = parseJSON(c.strengths_weaknesses);
  const strategy    = parseJSON(c.interview_strategy);
  const skillStack  = parseJSON(c.skill_stack);

  el.innerHTML = `
    <!-- ヘッダー -->
    <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div class="min-w-0">
        <h2 class="text-xl font-bold text-gray-900 break-all">${c.name || '(名称未取得)'}</h2>
        <a href="${c.url}" target="_blank" class="text-xs text-indigo-600 hover:underline break-all">${c.url}</a>
        ${c.job_url ? `<a href="${c.job_url}" target="_blank" class="block text-xs text-blue-500 hover:underline break-all">求人票: ${c.job_url}</a>` : ''}
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <select id="status-select"
          class="border border-gray-300 rounded-lg text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          ${STATUS_LIST.map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button id="btn-analyze"
          class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors">
          ${analyzed ? '再分析' : 'AI分析'}
        </button>
        <button id="btn-delete" title="削除"
          class="text-gray-400 hover:text-red-500 text-lg px-1.5 py-1.5 transition-colors">🗑</button>
      </div>
    </div>

    <!-- 基本情報グリッド -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      ${infoCard('勤務地',     c.location)}
      ${infoCard('勤務形態',   c.work_style)}
      ${infoCard('通勤（車）', c.commute_time_car ? `${c.commute_time_car}分` : null)}
      ${infoCard('開発形態',   c.development_type)}
      ${infoCard('年収レンジ', c.salary)}
      ${infoCard('予想初年収', c.expected_first_salary ? `${c.expected_first_salary}万円` : null)}
      ${infoCard('年収アッパー', c.salary_upper ? `${c.salary_upper}万円` : null)}
      ${infoCard('600万回収まで', c.years_to_recover ? `約${c.years_to_recover}年` : null)}
    </div>

    ${analyzed ? renderAnalysisSection(c, scores, sw, strategy, skillStack) : renderNotAnalyzed()}

    <!-- メモ -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 mt-5">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">メモ</h3>
      <textarea id="notes-textarea" rows="3" placeholder="自由にメモを記入..."
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400">${c.notes || ''}</textarea>
      <div class="flex justify-end mt-2">
        <button id="btn-save-notes"
          class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">保存</button>
      </div>
    </div>

    <!-- 面接スケジュール -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 mt-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-700">面接スケジュール</h3>
        <button id="btn-open-schedule-modal"
          class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">📷 スクショから追加</button>
      </div>
      <div id="schedule-section" class="text-xs text-gray-400">読み込み中...</div>
    </div>
  `;

  // レーダーチャート描画
  if (scores) setTimeout(() => renderRadar(scores), 30);

  // イベントリスナー設定
  document.getElementById('status-select').addEventListener('change', async e => {
    await api(`/api/companies/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: e.target.value }),
    });
    await loadCompanies();
    showToast('ステータスを更新しました', 'success');
  });

  document.getElementById('btn-analyze').addEventListener('click', () => runAnalysis(c.id));

  const ctaBtn = document.getElementById('btn-analyze-cta');
  if (ctaBtn) ctaBtn.addEventListener('click', () => runAnalysis(c.id));

  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!confirm(`「${c.name || c.url}」を削除しますか？`)) return;
    await api(`/api/companies/${c.id}`, { method: 'DELETE' });
    state.selectedId = null;
    document.getElementById('empty-state').classList.remove('hidden');
    el.classList.add('hidden');
    await loadCompanies();
    showToast('削除しました', 'info');
  });

  document.getElementById('btn-save-notes').addEventListener('click', async () => {
    const notes = document.getElementById('notes-textarea').value;
    await api(`/api/companies/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    });
    showToast('メモを保存しました', 'success');
  });

  // 詳細パネル内の「スクショから追加」ボタン
  document.getElementById('btn-open-schedule-modal')?.addEventListener('click', openScheduleModal);

  // スケジュール一覧を非同期で読み込む
  loadAndRenderSchedules(c.id);
}

function renderAnalysisSection(c, scores, sw, strategy, skillStack) {
  return `
    <!-- 概要 -->
    ${c.summary ? `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">事業概要</h3>
      <p class="text-sm text-gray-600 leading-relaxed">${c.summary}</p>
    </div>` : ''}

    <!-- スコアエリア -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <!-- レーダーチャート -->
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">5軸評価</h3>
        <div class="relative h-52"><canvas id="radar-chart"></canvas></div>
      </div>
      <!-- スコアバー -->
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">個人最適化スコア</h3>
        <div class="space-y-3">
          ${scoreBar('採用可能性',   c.hiring_probability_score, 'blue')}
          ${scoreBar('技術成長しやすさ', c.tech_growth_score,   'indigo')}
          ${scoreBar('キャリア成長', c.career_growth_score,      'purple')}
          ${c.inexperienced_ok !== null ? `
          <div class="flex items-center justify-between text-sm pt-1">
            <span class="text-gray-600">未経験枠</span>
            <span class="font-semibold ${c.inexperienced_ok ? 'text-green-600' : 'text-red-500'}">
              ${c.inexperienced_ok ? 'あり ✓' : 'なし'}
            </span>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- 強み / 弱み -->
    ${sw ? `
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="bg-green-50 rounded-xl border border-green-200 p-4">
        <h3 class="text-sm font-semibold text-green-700 mb-2">強み</h3>
        <ul class="space-y-1">
          ${(sw.strengths || []).map(s => `<li class="text-xs text-green-800 leading-relaxed">• ${s}</li>`).join('')}
        </ul>
      </div>
      <div class="bg-red-50 rounded-xl border border-red-200 p-4">
        <h3 class="text-sm font-semibold text-red-700 mb-2">注意点・弱み</h3>
        <ul class="space-y-1">
          ${(sw.weaknesses || []).map(s => `<li class="text-xs text-red-800 leading-relaxed">• ${s}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <!-- 面接対策 -->
    ${strategy ? `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">面接対策</h3>
      ${strategy.advice ? `<p class="text-sm text-gray-600 leading-relaxed mb-3">${strategy.advice}</p>` : ''}
      ${strategy.likely_questions ? `
      <p class="text-xs font-medium text-gray-500 mb-2">想定質問</p>
      <ul class="space-y-1.5">
        ${strategy.likely_questions.map(q =>
          `<li class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">Q. ${q}</li>`
        ).join('')}
      </ul>` : ''}
    </div>` : ''}

    <!-- キャリアパス -->
    ${c.career_path ? `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">キャリアパス</h3>
      <p class="text-sm text-gray-600 leading-relaxed">${c.career_path}</p>
    </div>` : ''}

    <!-- 技術スタック -->
    ${skillStack && skillStack.length ? `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">技術スタック</h3>
      <div class="flex flex-wrap gap-2">
        ${skillStack.map(s =>
          `<span class="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">${s}</span>`
        ).join('')}
      </div>
    </div>` : ''}
  `;
}

function renderNotAnalyzed() {
  return `
    <div class="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center my-4">
      <p class="text-sm font-semibold text-orange-700 mb-1">AIによる分析がまだ実行されていません</p>
      <p class="text-xs text-orange-600 mb-4">
        「AI分析」ボタンを押すと Gemini がこの企業を分析し、<br>
        スコア・強み弱み・面接対策を自動生成します（10〜30秒）。
      </p>
      <button id="btn-analyze-cta"
        class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
        AI分析を実行する
      </button>
    </div>
  `;
}

// ── レーダーチャート ──────────────────────────────────────────────────────

function renderRadar(scores) {
  const ctx = document.getElementById('radar-chart');
  if (!ctx) return;

  if (state.radarChart) {
    state.radarChart.destroy();
    state.radarChart = null;
  }

  state.radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['成長性', '安定性', 'カルチャー', 'WLB', '待遇'],
      datasets: [{
        data: [
          scores.growth           || 0,
          scores.stability        || 0,
          scores.culture_fit      || 0,
          scores.work_life_balance|| 0,
          scores.compensation     || 0,
        ],
        backgroundColor: 'rgba(99,102,241,0.15)',
        borderColor:     'rgba(99,102,241,0.9)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(99,102,241,1)',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 10,
          ticks: { stepSize: 2, font: { size: 9 }, color: '#9ca3af' },
          pointLabels: { font: { size: 11 }, color: '#374151' },
          grid: { color: '#e5e7eb' },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ── AI 分析実行 ──────────────────────────────────────────────────────────

async function runAnalysis(id) {
  const analyzeBtn = document.getElementById('btn-analyze');
  const ctaBtn     = document.getElementById('btn-analyze-cta');

  [analyzeBtn, ctaBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '分析中...';
  });

  // ローディング中表示
  const scoreSection = document.querySelector('#company-detail .bg-orange-50')
    || document.querySelector('#company-detail .grid.grid-cols-1');
  if (scoreSection) {
    scoreSection.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 col-span-2 text-gray-500">
        <div class="spinner mb-3"></div>
        <p class="text-sm">AIが企業サイトを分析中...</p>
        <p class="text-xs text-gray-400 mt-1">10〜30秒ほどお待ちください</p>
      </div>`;
  }

  try {
    const updated = await api(`/api/companies/${id}/analyze`, { method: 'POST' });
    renderDetail(updated);
    await loadCompanies();
    showToast('AI分析が完了しました！', 'success');
  } catch (e) {
    showToast(`分析エラー: ${e.message}`, 'error');
    if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = 'AI分析'; }
    if (ctaBtn)     { ctaBtn.disabled = false;     ctaBtn.textContent = 'AI分析を実行する'; }
  }
}

// ── 企業追加モーダル ──────────────────────────────────────────────────────

function openModal()  { document.getElementById('modal-add').classList.remove('hidden'); document.getElementById('input-url').focus(); }
function closeModal() { document.getElementById('modal-add').classList.add('hidden'); document.getElementById('form-add-company').reset(); }

document.getElementById('btn-add-company').addEventListener('click', openModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-add').addEventListener('click', closeModal);
document.getElementById('modal-add').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

document.getElementById('form-add-company').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-add');
  btn.disabled = true;
  btn.textContent = '登録中...';

  try {
    const company = await api('/api/companies', {
      method: 'POST',
      body: JSON.stringify({
        url:    document.getElementById('input-url').value,
        name:   document.getElementById('input-name').value   || null,
        source: document.getElementById('input-source').value || null,
      }),
    });

    closeModal();
    state.selectedId = company.id;
    await loadCompanies();

    if (document.getElementById('input-analyze').checked) {
      showToast('企業を登録しました。AI分析を開始します...', 'info');
      // ローディング表示
      document.getElementById('empty-state').classList.add('hidden');
      const detailEl = document.getElementById('company-detail');
      detailEl.classList.remove('hidden');
      detailEl.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-gray-500">
          <div class="spinner mb-4"></div>
          <p class="text-sm">AIが企業サイトを分析しています...</p>
          <p class="text-xs text-gray-400 mt-1">10〜30秒ほどお待ちください</p>
        </div>`;
      await runAnalysis(company.id);
    } else {
      await selectCompany(company.id);
      showToast('企業を登録しました', 'success');
    }
  } catch (err) {
    showToast(`エラー: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '登録';
  }
});

// ── ヘルパー関数 ──────────────────────────────────────────────────────────

function infoCard(label, value) {
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-3">
      <div class="text-xs text-gray-400 mb-0.5">${label}</div>
      <div class="text-sm font-medium ${value ? 'text-gray-800' : 'text-gray-300'}">${value || '—'}</div>
    </div>`;
}

function scoreBar(label, score, color) {
  if (score === null || score === undefined) return '';
  const bg = { blue: 'bg-blue-500', indigo: 'bg-indigo-500', purple: 'bg-purple-500' }[color] || 'bg-indigo-500';
  return `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-gray-600">${label}</span>
        <span class="font-semibold">${score}/10</span>
      </div>
      <div class="bg-gray-100 rounded-full h-1.5">
        <div class="${bg} h-1.5 rounded-full transition-all" style="width:${score * 10}%"></div>
      </div>
    </div>`;
}

function parseJSON(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const bg = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-indigo-600' }[type] || 'bg-indigo-600';
  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-white text-sm shadow-xl ${bg}`;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── スケジュール表示 ──────────────────────────────────────────────────────

async function loadAndRenderSchedules(companyId) {
  const section = document.getElementById('schedule-section');
  if (!section) return;

  const schedules = await api(`/api/schedules?company_id=${companyId}`);

  if (!schedules.length) {
    section.innerHTML = `<p class="text-xs text-gray-400">スケジュールはまだ登録されていません。<br>「📷 スクショから追加」でメールを読み込めます。</p>`;
    return;
  }

  const RESULT_STYLE = {
    '通過':   'text-green-600',
    '不合格': 'text-red-500',
    '待機中': 'text-yellow-600',
  };
  const FORMAT_BADGE = {
    'オンライン': 'bg-blue-50 text-blue-600',
    '対面':       'bg-orange-50 text-orange-600',
  };

  section.innerHTML = schedules.map(s => {
    const dt = s.start_time ? new Date(s.start_time) : null;
    const dateStr = dt ? dt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '日時未定';
    const fmtBadge = FORMAT_BADGE[s.interview_format] || 'bg-gray-100 text-gray-500';
    const resultStyle = RESULT_STYLE[s.result] || 'text-gray-400';
    return `
      <div class="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">${s.event_title}</span>
            ${s.interview_format ? `<span class="text-xs px-1.5 py-0.5 rounded-full ${fmtBadge}">${s.interview_format}</span>` : ''}
            ${s.result ? `<span class="text-xs font-medium ${resultStyle}">${s.result}</span>` : ''}
          </div>
          <div class="text-xs text-gray-500 mt-0.5">${dateStr}${s.interviewer ? ` · ${s.interviewer}` : ''}</div>
          ${s.interview_notes ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${s.interview_notes}</div>` : ''}
        </div>
        <div class="flex gap-1 flex-shrink-0">
          ${!s.result ? `
          <select class="result-select text-xs border border-gray-200 rounded px-1 py-0.5" data-schedule-id="${s.id}">
            <option value="">結果を記録</option>
            <option>通過</option>
            <option>不合格</option>
            <option>待機中</option>
          </select>` : ''}
          <button class="del-schedule text-gray-300 hover:text-red-400 text-sm px-1" data-schedule-id="${s.id}" title="削除">✕</button>
        </div>
      </div>`;
  }).join('');

  // 結果記録
  section.querySelectorAll('.result-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      await api(`/api/schedules/${sel.dataset.scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ result: sel.value }),
      });
      await loadAndRenderSchedules(companyId);
      showToast('結果を記録しました', 'success');
    });
  });

  // 削除
  section.querySelectorAll('.del-schedule').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このスケジュールを削除しますか？')) return;
      await api(`/api/schedules/${btn.dataset.scheduleId}`, { method: 'DELETE' });
      await loadAndRenderSchedules(companyId);
    });
  });
}

// ── スクショ → スケジュール追加モーダル ──────────────────────────────────

const scheduleModal = document.getElementById('modal-schedule-image');
let pendingImage = null; // { base64, mimeType }

function openScheduleModal() {
  scheduleModal.classList.remove('hidden');
  showPasteStep();
  pendingImage = null;
}

function closeScheduleModal() {
  scheduleModal.classList.add('hidden');
  pendingImage = null;
  document.getElementById('preview-img').src = '';
}

function showPasteStep() {
  document.getElementById('paste-step').classList.remove('hidden');
  document.getElementById('confirm-step').classList.add('hidden');
  document.getElementById('paste-placeholder').classList.remove('hidden');
  document.getElementById('paste-preview').classList.add('hidden');
  document.getElementById('btn-extract-schedule').disabled = true;
}

function showConfirmStep(extracted) {
  document.getElementById('paste-step').classList.add('hidden');
  document.getElementById('confirm-step').classList.remove('hidden');

  // 企業セレクトに現在の企業リストを入れる
  const sel = document.getElementById('confirm-company-id');
  sel.innerHTML = '<option value="">— 企業を選択 —</option>'
    + state.companies.map(c =>
        `<option value="${c.id}" ${c.id === extracted.company_id ? 'selected' : ''}>${c.name || c.url}</option>`
      ).join('');

  document.getElementById('confirm-event-title').value = extracted.event_title || '';
  // ISO 8601 → datetime-local 形式へ変換
  if (extracted.start_time) {
    const dt = new Date(extracted.start_time);
    if (!isNaN(dt)) {
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('confirm-start-time').value =
        `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
  }
  document.getElementById('confirm-format').value    = extracted.interview_format || 'オンライン';
  document.getElementById('confirm-interviewer').value = extracted.interviewer || '';
  document.getElementById('confirm-notes').value     = extracted.interview_notes || '';
}

// 画像を state にセットし、プレビュー表示
function setImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const base64  = dataUrl.split(',')[1];
    const mimeType = file.type || 'image/png';
    pendingImage = { base64, mimeType };

    document.getElementById('preview-img').src = dataUrl;
    document.getElementById('paste-placeholder').classList.add('hidden');
    document.getElementById('paste-preview').classList.remove('hidden');
    document.getElementById('btn-extract-schedule').disabled = false;
  };
  reader.readAsDataURL(file);
}

// ボタン・モーダル開閉
document.getElementById('btn-add-schedule-image').addEventListener('click', openScheduleModal);
document.getElementById('btn-close-schedule-modal').addEventListener('click', closeScheduleModal);
document.getElementById('btn-cancel-schedule-modal').addEventListener('click', closeScheduleModal);
document.getElementById('btn-back-to-paste').addEventListener('click', showPasteStep);
scheduleModal.addEventListener('click', e => { if (e.target === e.currentTarget) closeScheduleModal(); });

// 「別の画像を選択」
document.getElementById('btn-clear-image').addEventListener('click', () => {
  pendingImage = null;
  document.getElementById('paste-placeholder').classList.remove('hidden');
  document.getElementById('paste-preview').classList.add('hidden');
  document.getElementById('btn-extract-schedule').disabled = true;
});

// ファイル選択
document.getElementById('image-file-input').addEventListener('change', e => {
  if (e.target.files[0]) setImage(e.target.files[0]);
});

// ペーストエリアのクリック（フォーカスしてCtrl+V を受け取れるようにする）
document.getElementById('paste-area').addEventListener('click', function() {
  this.focus();
});

// グローバル paste イベント（モーダルが開いているときのみ処理）
document.addEventListener('paste', e => {
  if (scheduleModal.classList.contains('hidden')) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) { setImage(file); break; }
    }
  }
});

// AI 解析ボタン
document.getElementById('btn-extract-schedule').addEventListener('click', async () => {
  if (!pendingImage) return;
  const btn = document.getElementById('btn-extract-schedule');
  btn.disabled = true;
  btn.textContent = '解析中...';

  try {
    const extracted = await api('/api/schedules/from-image', {
      method: 'POST',
      body: JSON.stringify({ image_base64: pendingImage.base64, mime_type: pendingImage.mimeType }),
    });
    showConfirmStep(extracted);
    showToast('メール内容を読み取りました', 'success');
  } catch (e) {
    showToast(`解析エラー: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'AIで解析する';
  }
});

// 確認後に保存
document.getElementById('form-save-schedule').addEventListener('submit', async e => {
  e.preventDefault();
  const companyId = parseInt(document.getElementById('confirm-company-id').value);
  if (!companyId) { showToast('企業を選択してください', 'error'); return; }

  const startTimeVal = document.getElementById('confirm-start-time').value;
  if (!startTimeVal) { showToast('日時を入力してください', 'error'); return; }

  const btn = document.getElementById('btn-save-schedule');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    await api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        company_id:       companyId,
        event_title:      document.getElementById('confirm-event-title').value,
        start_time:       startTimeVal,
        interview_format: document.getElementById('confirm-format').value,
        interviewer:      document.getElementById('confirm-interviewer').value || null,
        interview_notes:  document.getElementById('confirm-notes').value || null,
      }),
    });

    closeScheduleModal();
    showToast('スケジュールを登録しました！', 'success');

    // 企業詳細を表示中なら再描画
    if (state.selectedId === companyId) {
      await loadAndRenderSchedules(companyId);
    } else {
      await selectCompany(companyId);
    }
  } catch (err) {
    showToast(`保存エラー: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'スケジュールに保存';
  }
});

// ── 起動 ──────────────────────────────────────────────────────────────────

init();
