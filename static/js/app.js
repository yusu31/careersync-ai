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
    const status     = c.status || '検討中';
    const badge      = STATUS_STYLE[status] || 'bg-gray-100 text-gray-600';
    const sel        = c.id === state.selectedId;
    const analyzed   = c.scores !== null;
    const displayUrl = c.url && !c.url.startsWith('unknown-') ? c.url : '(URL未登録)';
    return `
      <div class="company-card p-3 rounded-xl border cursor-pointer transition-all
        ${sel
          ? 'bg-indigo-50 border-indigo-300 shadow-sm'
          : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30'}"
        data-id="${c.id}">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium text-sm truncate">${c.name || '(名称未取得)'}</span>
          <span class="text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge}">${status}</span>
        </div>
        <div class="text-xs text-gray-400 mt-0.5 truncate">${displayUrl}</div>
        <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
          ${c.hiring_probability_score ? `<span>採用 <b>${scorePct(c.hiring_probability_score) || '-'}</b></span>` : ''}
          ${c.expected_first_salary   ? `<span>💴 ${c.expected_first_salary}万</span>` : ''}
          ${!analyzed ? '<span class="text-orange-400 font-medium">未分析</span>' : ''}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.company-card').forEach(card =>
    card.addEventListener('click', () => selectCompany(parseInt(card.dataset.id)))
  );
  updateBulkAnalyzeFooter();
}

// ── 企業詳細 ──────────────────────────────────────────────────────────────

async function selectCompany(id) {
  state.selectedId = id;
  renderCompanyList();

  // キャッシュデータで即座に描画（クリックの応答を即時にする）
  const cached = state.companies.find(c => c.id === id);
  if (cached) {
    renderDetail(cached);
    showAiBubble(cached.name || cached.url);
  }

  // バックグラウンドで最新データ取得（通勤データ等の更新に備える）
  const company = await api(`/api/companies/${id}`);
  const idx = state.companies.findIndex(c => c.id === id);
  if (idx !== -1) state.companies[idx] = company;

  // 取得済みデータと差異があるときだけ再描画
  if (JSON.stringify(cached) !== JSON.stringify(company)) {
    renderDetail(company);
    showAiBubble(company.name || company.url);
  }

  // 勤務地が登録済みで通勤データが未算出なら自動でGemini算出
  if (company.location && !company.commute_data) {
    calcCommuteAuto(id);
  }
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
        ${c.url && !c.url.startsWith('unknown-')
          ? `<a href="${c.url}" target="_blank" class="text-xs text-indigo-600 hover:underline break-all">${c.url}</a>`
          : ''}
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
      ${commuteInfoCard(c)}
      ${infoCard('開発形態',   c.development_type)}
      ${infoCard('年収レンジ', c.salary)}
      ${infoCard('賞与', c.bonus)}
      ${infoCard('予想初年収', c.expected_first_salary ? `${c.expected_first_salary}万円` : null)}
      ${infoCard('年収アッパー', c.salary_upper ? `${c.salary_upper}万円` : null)}
      ${infoCard('600万回収まで', c.years_to_recover ? `約${c.years_to_recover}年` : null)}
    </div>

    ${analyzed ? renderAnalysisSection(c, scores, sw, strategy, skillStack) : renderNotAnalyzed()}

    <!-- 求人元タグ -->
    ${renderJobSourcesCard(c)}

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

    <!-- 初心者向け業務説明 -->
    ${c.beginner_description ? `
    <div class="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-blue-700 mb-2">👶 実際に毎日何をするの？（未経験者向け）</h3>
      <p class="text-sm text-blue-900 leading-relaxed">${c.beginner_description}</p>
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
          ${hiringBar(c.hiring_probability_score)}
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

    <!-- 福利厚生・資格補助 -->
    ${c.benefits || c.qualification_support ? `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">福利厚生・資格補助</h3>
      ${c.benefits ? `
      <div class="mb-3">
        <p class="text-xs font-medium text-gray-500 mb-1">福利厚生</p>
        <p class="text-sm text-gray-700 leading-relaxed benefits-section">${c.benefits}</p>
      </div>` : ''}
      ${c.qualification_support ? `
      <div>
        <p class="text-xs font-medium text-gray-500 mb-1">資格補助・支援</p>
        <p class="text-sm text-gray-700 leading-relaxed">${c.qualification_support}</p>
      </div>` : ''}
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
      labels: ['成長性', '安定性', 'カルチャー', 'ワークライフバランス', '待遇'],
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

// ── API エラーを人間向けメッセージに変換 ────────────────────────────────────

function friendlyApiError(err) {
  const msg = err.message || '';
  if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
    return 'APIの無料枠（1日20回）に達しました。しばらく時間をおいてから再試行してください。';
  }
  if (msg.includes('502')) return 'AI分析サーバーに接続できませんでした。再度お試しください。';
  // 長すぎるエラーは最初の100文字だけ表示
  return msg.length > 100 ? msg.slice(0, 100) + '…' : msg;
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
    showToast(`分析エラー: ${friendlyApiError(e)}`, 'error');
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

// ── 通勤カード（詳細パネル用）────────────────────────────────────────────

// 通勤時間を "X時間Y分" 形式に整形
function fmtMinutes(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}時間${m > 0 ? m + '分' : ''}` : `${m}分`;
}

const COMMUTE_MODES = [
  { key: 'car',        icon: '🚗', label: '車' },
  { key: 'shinkansen', icon: '🚄', label: '新幹線+電車' },
  { key: 'train',      icon: '🚃', label: '在来線' },
  { key: 'bus',        icon: '🚌', label: 'バス' },
  { key: 'walk',       icon: '🚶', label: '徒歩' },
];

// グリッド内の小さい通勤カード（クリックでbodyにドロップダウンをportal描画）
function commuteInfoCard(c) {
  const cd = parseJSON(c.commute_data);
  const currentMode = c._commuteMode || 'car';
  const mInfo = COMMUTE_MODES.find(m => m.key === currentMode);
  const d = cd?.[currentMode];

  let valueHtml;
  if (!cd) {
    valueHtml = c.location
      ? `<span class="text-gray-400 text-xs">算出中...</span>`
      : `<span class="text-gray-300 text-xs">勤務地未登録</span>`;
  } else if (!d || d.minutes == null) {
    valueHtml = `<span class="text-red-400 text-xs font-medium">非現実的</span>`;
  } else {
    const fCls = d.feasibility === 'daily' ? 'text-green-600'
               : d.feasibility === 'occasional' ? 'text-yellow-600' : 'text-red-500';
    valueHtml = `<span class="${fCls} font-semibold">${fmtMinutes(d.minutes)}</span>`;
  }

  return `
    <div id="commute-grid-card-${c.id}"
         class="bg-white rounded-xl border border-gray-200 p-3 cursor-pointer
                hover:border-indigo-300 hover:shadow-sm transition-all group"
         onclick="toggleCommuteDropdown(${c.id})">
      <div class="text-xs text-gray-400 mb-0.5 flex items-center justify-between">
        <span>通勤 <span id="commute-mode-label-${c.id}">${mInfo?.icon || '🚗'} ${mInfo?.label || '車'}</span></span>
        <span id="commute-caret-${c.id}" class="text-gray-300 group-hover:text-indigo-400 transition-all text-xs">▾</span>
      </div>
      <div class="text-sm" id="commute-time-display-${c.id}">${valueHtml}</div>
    </div>`;
}

// bodyにportalとして描画（overflow:hiddenに影響されない）
function toggleCommuteDropdown(companyId) {
  const existing = document.getElementById('commute-portal');
  const isMyPortal = existing?.dataset.forId == companyId;
  closeCommutePortal();
  if (isMyPortal) return; // 同じカードをもう一度クリックで閉じる

  const card = document.getElementById(`commute-grid-card-${companyId}`);
  if (!card) return;
  const c = state.companies?.find(c => c.id == companyId);
  if (!c) return;

  const rect = card.getBoundingClientRect();
  const cd = parseJSON(c.commute_data);
  const currentMode = c._commuteMode || 'car';

  const portal = document.createElement('div');
  portal.id = 'commute-portal';
  portal.dataset.forId = companyId;
  portal.style.cssText = `
    position:fixed;
    left:${rect.left}px;
    top:${rect.bottom + 4}px;
    min-width:${Math.max(rect.width, 272)}px;
    z-index:9999;
    background:white;
    border:1px solid #e5e7eb;
    border-radius:14px;
    box-shadow:0 8px 32px rgba(0,0,0,0.14),0 2px 8px rgba(99,102,241,0.08);
    padding:8px;
    animation:popoverIn 0.15s ease-out;
  `;

  // Googleマップ travelmode マッピング
  const GM_MODE = { car: 'driving', shinkansen: 'transit', train: 'transit', bus: 'transit', walk: 'walking' };
  const origin = encodeURIComponent('福島県郡山市字原中');
  const dest   = encodeURIComponent(c.location || '');

  const rows = COMMUTE_MODES.map(m => {
    const md = cd?.[m.key];
    const time = md?.minutes ? fmtMinutes(md.minutes)
               : cd ? (md === undefined ? '—' : '非現実的') : '—';
    const fCls = !cd || md?.minutes == null
               ? 'text-gray-400'
               : md.feasibility === 'daily'      ? 'text-green-600 font-semibold'
               : md.feasibility === 'occasional'  ? 'text-yellow-600 font-semibold'
               : 'text-red-400 font-medium';
    const dist   = md?.distance_km ? ` · ${md.distance_km}km` : '';
    const active = currentMode === m.key;
    const gmUrl  = c.location
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=${GM_MODE[m.key]}`
      : null;

    return `
      <div class="flex items-center gap-1 rounded-lg ${active ? 'bg-indigo-50' : ''} hover:bg-indigo-50 transition-colors pr-1">
        <button onclick="selectCommuteMode(${companyId},'${m.key}')"
          class="flex-1 flex items-center gap-3 px-2 py-2 text-left">
          <span class="text-base w-5 text-center">${m.icon}</span>
          <span class="flex-1">
            <span class="text-sm text-gray-700 font-medium">${m.label}</span>
            <span class="block text-xs ${fCls}">${time}${dist}</span>
          </span>
          ${active ? '<span class="text-indigo-500 text-xs mr-1">✓</span>' : ''}
        </button>
        ${gmUrl ? `
          <a href="${gmUrl}" target="_blank" rel="noopener"
             onclick="event.stopPropagation()"
             title="Googleマップで経路を開く"
             class="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </a>` : ''}
      </div>`;
  }).join('');

  portal.innerHTML = `
    <p class="text-xs text-gray-400 px-2 py-1 mb-1">🗺 郡山市字原中 → 勤務地</p>
    ${rows}
    <div class="border-t border-gray-100 mt-2 pt-2">
      <button id="commute-calc-btn-${companyId}"
        onclick="calcCommuteInCard(${companyId})"
        class="w-full text-xs py-1.5 rounded-lg transition-colors
               ${cd ? 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50' : 'text-indigo-600 hover:text-indigo-800 font-medium hover:bg-indigo-50'}">
        ${cd ? '再算出' : '🗺 Geminiで通勤時間を算出'}
      </button>
    </div>`;

  document.body.appendChild(portal);
  const caret = document.getElementById(`commute-caret-${companyId}`);
  if (caret) caret.style.transform = 'rotate(180deg)';
}

function closeCommutePortal() {
  const portal = document.getElementById('commute-portal');
  if (!portal) return;
  const id = portal.dataset.forId;
  portal.remove();
  const caret = document.getElementById(`commute-caret-${id}`);
  if (caret) caret.style.transform = '';
}

// 交通手段を選択してカードを更新
function selectCommuteMode(companyId, mode) {
  closeCommutePortal();
  const c = state.companies?.find(c => c.id == companyId);
  if (!c) return;
  c._commuteMode = mode;

  const cd = parseJSON(c.commute_data);
  const mInfo = COMMUTE_MODES.find(m => m.key === mode);
  const d = cd?.[mode];

  const label = document.getElementById(`commute-mode-label-${companyId}`);
  if (label) label.textContent = `${mInfo?.icon} ${mInfo?.label}`;

  const display = document.getElementById(`commute-time-display-${companyId}`);
  if (display) {
    let html;
    if (!d || d.minutes == null) {
      html = `<span class="${!d ? 'text-gray-400' : 'text-red-400'} text-xs">${!d ? '—' : '非現実的'}</span>`;
    } else {
      const fCls = d.feasibility === 'daily' ? 'text-green-600'
                 : d.feasibility === 'occasional' ? 'text-yellow-600' : 'text-red-500';
      html = `<span class="${fCls} font-semibold">${fmtMinutes(d.minutes)}</span>`;
    }
    display.innerHTML = html;
  }
}

// グリッドカードから通勤算出（手動）
async function calcCommuteInCard(companyId) {
  const btn = document.getElementById(`commute-calc-btn-${companyId}`);
  if (btn) { btn.textContent = '算出中...'; btn.disabled = true; }
  try {
    await api(`/api/companies/${companyId}/commute`, { method: 'POST' });
    closeCommutePortal();
    await selectCompany(companyId);
    showToast('通勤時間を算出しました', 'success');
  } catch (e) {
    showToast(`エラー: ${e.message}`, 'error');
    if (btn) { btn.textContent = '再算出'; btn.disabled = false; }
  }
}

// 企業選択時の自動算出（勤務地あり・未算出の場合）
async function calcCommuteAuto(companyId) {
  try {
    const updated = await api(`/api/companies/${companyId}/commute`, { method: 'POST' });
    // state更新して表示を切り替え（ページ再描画なし）
    if (state.companies) {
      const idx = state.companies.findIndex(c => c.id === companyId);
      if (idx !== -1) state.companies[idx] = updated;
    }
    // グリッドカードの表示だけ更新
    const card = document.getElementById(`commute-grid-card-${companyId}`);
    if (card) {
      const c = updated;
      c._commuteMode = 'car';
      const cd = parseJSON(c.commute_data);
      const d = cd?.car;
      const label = document.getElementById(`commute-mode-label-${companyId}`);
      if (label) label.textContent = '🚗 車';
      const display = document.getElementById(`commute-time-display-${companyId}`);
      if (display && d?.minutes) {
        const fCls = d.feasibility === 'daily' ? 'text-green-600'
                   : d.feasibility === 'occasional' ? 'text-yellow-600' : 'text-red-500';
        display.innerHTML = `<span class="${fCls} font-semibold">${fmtMinutes(d.minutes)}</span>`;
      }
    }
  } catch (e) {
    // 自動算出失敗はサイレントに無視
  }
}

// カード外クリックでドロップダウンを閉じる
document.addEventListener('click', e => {
  const portal = document.getElementById('commute-portal');
  if (!portal) return;
  const cardId = portal.dataset.forId;
  const card = document.getElementById(`commute-grid-card-${cardId}`);
  if (!portal.contains(e.target) && !card?.contains(e.target)) closeCommutePortal();
});

// ── 求人元カード（詳細パネル用）──────────────────────────────────────────

const COMMON_SOURCES = [
  'リクルートエージェント', 'doda', 'マイナビ転職', 'ビズリーチ',
  'Green', 'Wantedly', 'Indeed', '転職サイト（その他）',
  '知人紹介', '直接応募',
];

function renderJobSourcesCard(c) {
  const sources = parseJSON(c.job_sources) || [];
  const tagsHtml = sources.map((s, i) =>
    `<span class="source-tag-removable">${s}
       <button onclick="removeJobSource(${c.id}, ${i})">×</button>
     </span>`
  ).join('');

  const suggestHtml = COMMON_SOURCES
    .filter(s => !sources.includes(s))
    .map(s => `<button onclick="addJobSource(${c.id},'${s}')"
         class="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500
                hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
         + ${s}
       </button>`).join('');

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mt-5" id="sources-card-${c.id}">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-700">📋 求人元 / エージェント</h3>
        ${c.job_url ? `<a href="${c.job_url}" target="_blank"
          class="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          🔗 求人票を見る
        </a>` : ''}
      </div>
      <div class="source-input-wrap mb-3" id="sources-tags-${c.id}" onclick="focusSourceInput(${c.id})">
        ${tagsHtml}
        <input type="text" id="source-input-${c.id}" placeholder="${sources.length === 0 ? 'エージェント名を入力...' : ''}"
          class="flex-1 min-w-24 text-xs outline-none bg-transparent"
          onkeydown="handleSourceInput(event, ${c.id})">
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2">
        ${suggestHtml}
      </div>
    </div>`;
}

function focusSourceInput(id) {
  document.getElementById(`source-input-${id}`)?.focus();
}

async function addJobSource(companyId, source) {
  const c = state.companies?.find(c => c.id === companyId);
  const current = parseJSON(c?.job_sources) || [];
  if (current.includes(source)) return;
  await saveJobSources(companyId, [...current, source]);
}

async function removeJobSource(companyId, index) {
  const c = state.companies?.find(c => c.id === companyId);
  const current = parseJSON(c?.job_sources) || [];
  current.splice(index, 1);
  await saveJobSources(companyId, current);
}

async function handleSourceInput(event, companyId) {
  if (event.key !== 'Enter') return;
  const input = event.target;
  const val = input.value.trim();
  if (!val) return;
  input.value = '';
  await addJobSource(companyId, val);
}

async function saveJobSources(companyId, sources) {
  try {
    const updated = await api(`/api/companies/${companyId}/sources`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_sources: sources }),
    });
    // 企業リスト内のデータを更新（再描画なし）
    if (state.companies) {
      const idx = state.companies.findIndex(c => c.id === companyId);
      if (idx !== -1) state.companies[idx] = updated;
    }
    // 求人元カードのみ再描画
    const card = document.getElementById(`sources-card-${companyId}`);
    if (card) card.outerHTML = renderJobSourcesCard(updated);
  } catch (e) {
    showToast(`保存エラー: ${e.message}`, 'error');
  }
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

// 採用確率専用バー（0〜10スケール → %表示）
function hiringBar(score) {
  if (score === null || score === undefined) return '';
  const pctStr = scorePct(score);
  if (!pctStr) return '';
  const pct = parseInt(pctStr);
  const color = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return `
    <div class="score-bar-hiring">
      <div class="flex justify-between text-xs mb-1">
        <span class="text-gray-600">採用可能性</span>
        <span class="font-semibold ${color}">${pct}%</span>
      </div>
      <div class="bg-gray-100 rounded-full h-1.5">
        <div class="bg-blue-500 h-1.5 rounded-full transition-all" style="width:${pct}%"></div>
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

// ── 比較ビュー ─────────────────────────────────────────────────────────────

// ── 比較ビュー共通 ─────────────────────────────────────────────────────────

const compareState = { sortCol: 'total', sortAsc: false, tab: 'score' };
const condState    = { sortCol: 'salary', sortAsc: false };

const STATUS_ORDER = {
  '気になる': 0, '応募済み': 1, '書類選考中': 2, '面接中': 3,
  '内定': 4, '辞退': 5, '不合格': 6,
};

const STATUS_COLORS = {
  '気になる':   'bg-gray-100 text-gray-600',
  '応募済み':   'bg-blue-100 text-blue-700',
  '書類選考中': 'bg-indigo-100 text-indigo-700',
  '面接中':     'bg-violet-100 text-violet-700',
  '内定':       'bg-green-100 text-green-700',
  '辞退':       'bg-gray-100 text-gray-400',
  '不合格':     'bg-red-100 text-red-400',
};

function scoreClass(val) {
  if (val == null || val === '') return 'none';
  const n = Number(val);
  if (n >= 8) return 'high';
  if (n >= 5) return 'mid';
  return 'low';
}

// 採用確率専用（0〜10スケール）
function hiringClass(val) {
  if (val == null || val === '') return 'none';
  const n = normalizeScore10(Number(val));
  if (n == null) return 'none';
  if (n >= 7) return 'high';
  if (n >= 4) return 'mid';
  return 'low';
}

function scoreChip(val) {
  if (val == null || val === '') return '<span class="score-chip none">—</span>';
  return `<span class="score-chip ${scoreClass(val)}">${Number(val).toFixed(1)}</span>`;
}

function hiringChip(val) {
  if (val == null || val === '') return '<span class="score-chip none">—</span>';
  return `<span class="score-chip ${hiringClass(val)}">${scorePct(val) || '-'}</span>`;
}

// 総合スコア: hiring_probability_score は0〜10スケールなので除外して他のスコアのみ平均
function calcTotal(scores, tech, career) {
  const vals = [
    scores?.growth, scores?.stability, scores?.culture_fit,
    scores?.work_life_balance, scores?.compensation,
    tech, career,
  ].filter(v => v != null && v !== '').map(Number);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function nameCell(c) {
  return `<td class="px-4 py-3">
    <div class="font-medium text-gray-800 truncate max-w-48">${c.name || c.url}</div>
    ${c.industry ? `<div class="text-xs text-gray-400 truncate">${c.industry}</div>` : ''}
  </td>`;
}

function statusCell(c) {
  const cls = STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500';
  return `<td class="px-3 py-3 whitespace-nowrap">
    <span class="text-xs px-2 py-0.5 rounded-full font-medium ${cls}">${c.status}</span>
  </td>`;
}

// ── スコアタブ ──────────────────────────────────────────────────────────────

function renderComparison() {
  const tbody = document.getElementById('comparison-tbody');
  if (!tbody) return;

  const companies = state.companies || [];
  const rows = companies.map(c => {
    const scores = parseJSON(c.scores);
    const total  = calcTotal(scores, c.tech_growth_score, c.career_growth_score);
    return { c, scores, total };
  });

  const col = compareState.sortCol;
  rows.sort((a, b) => {
    let va, vb;
    switch (col) {
      case 'name':              va = a.c.name || ''; vb = b.c.name || ''; break;
      case 'status':            va = STATUS_ORDER[a.c.status] ?? 99; vb = STATUS_ORDER[b.c.status] ?? 99; break;
      case 'hiring':            va = a.c.hiring_probability_score ?? -1; vb = b.c.hiring_probability_score ?? -1; break;
      case 'growth':            va = a.scores?.growth ?? -1;             vb = b.scores?.growth ?? -1; break;
      case 'stability':         va = a.scores?.stability ?? -1;          vb = b.scores?.stability ?? -1; break;
      case 'culture_fit':       va = a.scores?.culture_fit ?? -1;        vb = b.scores?.culture_fit ?? -1; break;
      case 'work_life_balance': va = a.scores?.work_life_balance ?? -1;  vb = b.scores?.work_life_balance ?? -1; break;
      case 'compensation':      va = a.scores?.compensation ?? -1;       vb = b.scores?.compensation ?? -1; break;
      case 'tech':              va = a.c.tech_growth_score ?? -1;        vb = b.c.tech_growth_score ?? -1; break;
      case 'career':            va = a.c.career_growth_score ?? -1;      vb = b.c.career_growth_score ?? -1; break;
      default:                  va = a.total ?? -1; vb = b.total ?? -1; break;
    }
    if (typeof va === 'string') return compareState.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return compareState.sortAsc ? va - vb : vb - va;
  });

  tbody.innerHTML = rows.map(({ c, scores, total }) => {
    const analyzed  = c.scores !== null;
    const totalChip = total != null
      ? `<span class="score-chip total-score-cell ${scoreClass(total)}">${total.toFixed(1)}</span>`
      : '<span class="score-chip none">未分析</span>';

    return `<tr onclick="selectCompanyAndSwitchList(${c.id})">
      ${nameCell(c)}${statusCell(c)}
      <td class="px-3 py-3 text-center">${analyzed ? hiringChip(c.hiring_probability_score) : '<span class="score-chip none">未分析</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(scores?.growth)             : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(scores?.stability)          : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(scores?.culture_fit)        : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(scores?.work_life_balance)  : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(scores?.compensation)       : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(c.tech_growth_score)        : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${analyzed ? scoreChip(c.career_growth_score)      : '<span class="score-chip none">—</span>'}</td>
      <td class="px-3 py-3 text-center">${totalChip}</td>
    </tr>`;
  }).join('');

  updateSortIcons('.sort-th', '.sort-icon', col, compareState.sortAsc);
}

document.querySelectorAll('.sort-th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    compareState.sortAsc = compareState.sortCol === col ? !compareState.sortAsc : false;
    compareState.sortCol = col;
    renderComparison();
  });
});

// ── 条件タブ ────────────────────────────────────────────────────────────────

function fmtSalary(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  return n >= 10000 ? `${(n / 10000).toFixed(0)}万円` : `${n}万円`;
}

function fmtOvertime(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  const cls = n <= 20 ? 'text-green-600' : n <= 40 ? 'text-yellow-600' : 'text-red-600';
  return `<span class="${cls} font-medium">${n}h</span>`;
}

function fmtPaidLeave(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  const cls = n >= 70 ? 'text-green-600' : n >= 50 ? 'text-yellow-600' : 'text-red-600';
  return `<span class="${cls} font-medium">${n}%</span>`;
}

function boolBadge(val, trueLabel = 'あり', falseLabel = 'なし') {
  if (val == null || val === '') return '<span class="text-gray-400">—</span>';
  const isTrue = val === true || val === 1 || val === 'true' || val === 'あり' || val === '有';
  return isTrue
    ? `<span class="text-green-600 font-medium">✓ ${trueLabel}</span>`
    : `<span class="text-gray-400">${falseLabel}</span>`;
}

// 選択中の通勤交通手段
let selectedCommuteMode = 'car';

function fmtCommute(commuteData, mode) {
  if (!commuteData) return '<button class="text-xs text-indigo-500 hover:underline" onclick="event.stopPropagation();calcCommuteInTable(this)" data-id="">算出</button>';
  const d = parseJSON(commuteData)?.[mode];
  if (!d) return '<span class="text-gray-400 text-xs">—</span>';
  if (d.minutes == null) return '<span class="text-gray-400 text-xs">非現実的</span>';
  const h = Math.floor(d.minutes / 60);
  const m = d.minutes % 60;
  const timeStr = h > 0 ? `${h}時間${m > 0 ? m + '分' : ''}` : `${m}分`;
  const fCls = d.feasibility === 'daily' ? 'feasibility-daily'
             : d.feasibility === 'occasional' ? 'feasibility-occasional'
             : 'feasibility-impractical';
  return `<span class="${fCls}">${timeStr}</span>`;
}

function fmtDistance(commuteData, mode) {
  if (!commuteData) return '—';
  const d = parseJSON(commuteData)?.[mode];
  if (!d?.distance_km) return '—';
  return `${d.distance_km.toFixed(0)} km`;
}

function fmtSources(jobSources) {
  const arr = parseJSON(jobSources) || [];
  if (arr.length === 0) return '<span class="text-gray-400 text-xs">未登録</span>';
  return arr.map(s => `<span class="source-tag">${s}</span>`).join(' ');
}

async function calcCommuteInTable(btn) {
  const id = btn.dataset.id || state.selectedId;
  if (!id) return;
  btn.textContent = '算出中...';
  btn.disabled = true;
  try {
    const res = await api(`/api/companies/${id}/commute`, { method: 'POST' });
    // 企業データを再取得して再描画
    state.companies = await api('/api/companies');
    renderComparisonConditions();
  } catch (e) {
    showToast(`通勤算出エラー: ${e.message}`, 'error');
    btn.textContent = '算出';
    btn.disabled = false;
  }
}

function renderComparisonConditions() {
  const tbody = document.getElementById('conditions-tbody');
  if (!tbody) return;

  const companies = state.companies || [];
  const rows = [...companies];
  const mode = selectedCommuteMode;

  const col = condState.sortCol;
  rows.sort((a, b) => {
    let va, vb;
    const cdA = parseJSON(a.commute_data)?.[mode];
    const cdB = parseJSON(b.commute_data)?.[mode];
    switch (col) {
      case 'name':         va = a.name || ''; vb = b.name || ''; break;
      case 'status':       va = STATUS_ORDER[a.status] ?? 99; vb = STATUS_ORDER[b.status] ?? 99; break;
      case 'salary':       va = a.expected_first_salary ?? -1; vb = b.expected_first_salary ?? -1; break;
      case 'salary_upper': va = a.salary_upper ?? -1;          vb = b.salary_upper ?? -1; break;
      case 'commute':      va = cdA?.minutes ?? 9999;          vb = cdB?.minutes ?? 9999; break;
      case 'distance':     va = cdA?.distance_km ?? 9999;      vb = cdB?.distance_km ?? 9999; break;
      case 'overtime':     va = a.overtime_hours ?? 9999;      vb = b.overtime_hours ?? 9999; break;
      case 'paid_leave':   va = a.paid_leave_rate ?? -1;       vb = b.paid_leave_rate ?? -1; break;
      default:             va = a.name || ''; vb = b.name || ''; break;
    }
    if (typeof va === 'string') return condState.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return condState.sortAsc ? va - vb : vb - va;
  });

  tbody.innerHTML = rows.map(c => {
    const hasCommute = !!c.commute_data;
    const commuteCell = hasCommute
      ? fmtCommute(c.commute_data, mode)
      : `<button class="text-xs text-indigo-500 hover:text-indigo-700 font-medium underline-offset-2 hover:underline"
           onclick="event.stopPropagation();calcCommuteRow(${c.id}, this)">算出する</button>`;

    return `<tr onclick="selectCompanyAndSwitchList(${c.id})">
      ${nameCell(c)}${statusCell(c)}
      <td class="px-3 py-3 text-right font-semibold text-gray-800">${fmtSalary(c.expected_first_salary)}</td>
      <td class="px-3 py-3 text-right font-semibold text-gray-800">${fmtSalary(c.salary_upper)}</td>
      <td class="px-3 py-3 text-center">${commuteCell}</td>
      <td class="px-3 py-3 text-center text-gray-600">${fmtDistance(c.commute_data, mode)}</td>
      <td class="px-3 py-3 text-left text-gray-700">${c.location || '<span class="text-gray-400">—</span>'}</td>
      <td class="px-3 py-3 text-left text-gray-700">${c.work_style || '<span class="text-gray-400">—</span>'}</td>
      <td class="px-3 py-3 text-right">${fmtOvertime(c.overtime_hours)}</td>
      <td class="px-3 py-3 text-right">${fmtPaidLeave(c.paid_leave_rate)}</td>
      <td class="px-3 py-3 text-center">${boolBadge(c.inexperienced_ok)}</td>
      <td class="px-3 py-3 text-left text-gray-700 max-w-[12rem] truncate" title="${c.bonus || ''}">${c.bonus || '<span class="text-gray-400">—</span>'}</td>
      <td class="px-3 py-3 text-left text-gray-700 max-w-[12rem] truncate" title="${c.qualification_support || ''}">${c.qualification_support || '<span class="text-gray-400">—</span>'}</td>
      <td class="px-3 py-3">${fmtSources(c.job_sources)}</td>
    </tr>`;
  }).join('');

  updateSortIcons('.sort-th-c', '.sort-icon-c', col, condState.sortAsc);
}

async function calcCommuteRow(companyId, btn) {
  const orig = btn.textContent;
  btn.textContent = '算出中...';
  btn.disabled = true;
  try {
    await api(`/api/companies/${companyId}/commute`, { method: 'POST' });
    state.companies = await api('/api/companies');
    renderComparisonConditions();
    showToast('通勤時間を算出しました', 'success');
  } catch (e) {
    showToast(`エラー: ${e.message}`, 'error');
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// 交通手段タブの切り替え
document.querySelectorAll('.commute-transport-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedCommuteMode = btn.dataset.mode;
    document.querySelectorAll('.commute-transport-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderComparisonConditions();
  });
});

document.querySelectorAll('.sort-th-c').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    condState.sortAsc = condState.sortCol === col ? !condState.sortAsc : false;
    condState.sortCol = col;
    renderComparisonConditions();
  });
});

// ── タブ切り替え ────────────────────────────────────────────────────────────

function switchCompareTab(tab) {
  const panels = {
    score: document.getElementById('compare-tab-score'),
    cond:  document.getElementById('compare-tab-cond'),
    rank:  document.getElementById('compare-tab-rank'),
  };
  const btns = {
    score: document.getElementById('btn-tab-score'),
    cond:  document.getElementById('btn-tab-cond'),
    rank:  document.getElementById('btn-tab-rank'),
  };

  compareState.tab = tab;

  Object.keys(panels).forEach(key => {
    panels[key].classList.toggle('hidden', key !== tab);
    if (key === tab) {
      btns[key].classList.add('bg-indigo-600', 'text-white');
      btns[key].classList.remove('bg-white', 'text-gray-500');
    } else {
      btns[key].classList.remove('bg-indigo-600', 'text-white');
      btns[key].classList.add('bg-white', 'text-gray-500');
    }
  });

  if (tab === 'score') renderComparison();
  else if (tab === 'cond') renderComparisonConditions();
  else if (tab === 'rank') renderRanking();
}

document.getElementById('btn-tab-score').addEventListener('click', () => switchCompareTab('score'));
document.getElementById('btn-tab-cond').addEventListener('click',  () => switchCompareTab('cond'));
document.getElementById('btn-tab-rank').addEventListener('click',  () => switchCompareTab('rank'));

// ── ランキングタブ ────────────────────────────────────────────────────────────

// 10を超えるスコアは100点満点と判断して /10 に正規化
function normalizeScore10(v) {
  if (v == null || v < 0) return null;
  return v > 10 ? Math.round(v / 10 * 10) / 10 : v;
}

// スコアをパーセント表示に変換（例: 8 → "80%"、8.8 → "88%"）
function scorePct(v) {
  const n = normalizeScore10(v);
  return n != null ? `${Math.round(n * 10)}%` : null;
}

// 現在選択中のランキング軸
let rankingActiveKey = 'hiring';

function buildRankingAxes(mode) {
  return [
    {
      key:   'hiring',
      label: '採用しやすさ',
      emoji: '🎯',
      desc:  'AIが推定した採用可能性スコア。高いほど内定が出やすい。',
      score: c => normalizeScore10(c.hiring_probability_score) ?? -1,
      detail: c => {
        const pct = scorePct(c.hiring_probability_score);
        const lines = [];
        if (pct != null) lines.push(`採用可能性: ${pct}`);
        lines.push(c.inexperienced_ok ? '✓ 未経験者OK' : '未経験者枠: なし');
        if (c.training_program) {
          const t = c.training_program.length > 50 ? c.training_program.slice(0, 50) + '…' : c.training_program;
          lines.push(`研修: ${t}`);
        }
        return lines;
      },
    },
    {
      key:   'salary',
      label: '初年度給与',
      emoji: '💴',
      desc:  '転職直後の予想年収。高いほど上位。',
      score: c => c.expected_first_salary ?? -1,
      detail: c => {
        const lines = [];
        if (c.expected_first_salary) lines.push(`予想初年収: ${c.expected_first_salary}万円`);
        if (c.salary)                lines.push(`年収レンジ: ${c.salary}`);
        if (c.years_to_recover)      lines.push(`現年収600万に戻るまで: 約${c.years_to_recover}年`);
        return lines;
      },
    },
    {
      key:   'salary_upper',
      label: '年収ポテンシャル',
      emoji: '📈',
      desc:  '将来的に到達できる年収の上限目安。高いほど上位。',
      score: c => c.salary_upper ?? -1,
      detail: c => {
        const lines = [];
        if (c.salary_upper)          lines.push(`年収上限: ${c.salary_upper}万円`);
        if (c.salary)                lines.push(`年収レンジ: ${c.salary}`);
        if (c.expected_first_salary) lines.push(`入社直後の予想年収: ${c.expected_first_salary}万円`);
        return lines;
      },
    },
    {
      key:   'commute',
      label: '通勤距離（近い順）',
      emoji: '🚗',
      desc:  '選択中の交通手段で郡山からの距離が短い順。',
      score: c => {
        const d = parseJSON(c.commute_data)?.[mode]?.distance_km;
        return d != null ? -d : -99999;
      },
      detail: c => {
        const cd = parseJSON(c.commute_data)?.[mode];
        const lines = [];
        if (cd) {
          if (cd.distance_km != null) lines.push(`距離: ${cd.distance_km} km`);
          if (cd.minutes     != null) lines.push(`通勤時間: ${cd.minutes}分`);
          if (cd.cost)                lines.push(`交通費: ${cd.cost}`);
        } else {
          lines.push('通勤データ未算出（条件タブの「算出する」から実行可能）');
        }
        if (c.location) lines.push(`勤務地: ${c.location}`);
        return lines;
      },
    },
    {
      key:   'wlb',
      label: 'ワークライフバランス',
      emoji: '😌',
      desc:  '残業時間・有給消化率・AIのワークライフバランス評価を総合。',
      score: c => {
        const scores = parseJSON(c.scores);
        const wlb = normalizeScore10(scores?.work_life_balance) ?? 5;
        const ot  = c.overtime_hours  != null ? Math.max(0, 10 - c.overtime_hours / 4) : 5;
        const pl  = c.paid_leave_rate != null ? c.paid_leave_rate / 10 : 5;
        return wlb * 0.5 + ot * 0.3 + pl * 0.2;
      },
      detail: c => {
        const scores = parseJSON(c.scores);
        const wlb = normalizeScore10(scores?.work_life_balance);
        const lines = [];
        if (wlb != null)                lines.push(`AIワークライフバランス評価: ${Math.round(wlb * 10)}%`);
        if (c.overtime_hours  != null)  lines.push(`月平均残業: ${c.overtime_hours}時間`);
        if (c.paid_leave_rate != null)  lines.push(`有給消化率: ${c.paid_leave_rate}%`);
        if (c.work_style)               lines.push(`勤務形態: ${c.work_style}`);
        return lines;
      },
    },
    {
      key:   'career',
      label: 'キャリアアップしやすさ',
      emoji: '🚀',
      desc:  '技術成長・キャリア成長スコアの平均。高いほど上位。',
      score: c => {
        const t = normalizeScore10(c.tech_growth_score)   ?? -1;
        const g = normalizeScore10(c.career_growth_score) ?? -1;
        if (t < 0 && g < 0) return -1;
        const vals = [t, g].filter(v => v >= 0);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      },
      detail: c => {
        const t = normalizeScore10(c.tech_growth_score);
        const g = normalizeScore10(c.career_growth_score);
        const lines = [];
        if (t != null) lines.push(`技術が身につきやすさ: ${scorePct(c.tech_growth_score)}`);
        if (g != null) lines.push(`キャリアが上がりやすさ: ${scorePct(c.career_growth_score)}`);
        if (c.career_path) {
          const short = c.career_path.length > 60 ? c.career_path.slice(0, 60) + '…' : c.career_path;
          lines.push(`キャリアパス: ${short}`);
        }
        return lines;
      },
    },
    {
      key:   'total',
      label: '総合おすすめ（あなたに合う）',
      emoji: '⭐',
      desc:  '採用確率・給与・ワークライフバランス・キャリア成長の加重スコア。',
      score: c => {
        const scores = parseJSON(c.scores);
        const h = normalizeScore10(c.hiring_probability_score) ?? -1;
        const s = normalizeScore10(scores?.compensation)       ?? -1;
        const w = normalizeScore10(scores?.work_life_balance)  ?? -1;
        const t = normalizeScore10(c.tech_growth_score)        ?? -1;
        const g = normalizeScore10(c.career_growth_score)      ?? -1;
        if ([h, s, w, t, g].every(v => v < 0)) return -1;
        const safe = v => v >= 0 ? v : 5;
        return safe(h) * 0.30 + safe(s) * 0.20 + safe(w) * 0.20
             + safe(t) * 0.15 + safe(g) * 0.15;
      },
      detail: c => {
        const scores = parseJSON(c.scores);
        const h = normalizeScore10(c.hiring_probability_score);
        const s = normalizeScore10(scores?.compensation);
        const w = normalizeScore10(scores?.work_life_balance);
        const t = normalizeScore10(c.tech_growth_score);
        const g = normalizeScore10(c.career_growth_score);
        const lines = [];
        if (h != null) lines.push(`採用可能性: ${scorePct(c.hiring_probability_score)}（ウェイト 30%）`);
        if (s != null) lines.push(`給与評価: ${Math.round(s * 10)}%（ウェイト 20%）`);
        if (w != null) lines.push(`ワークライフバランス: ${Math.round(w * 10)}%（ウェイト 20%）`);
        if (t != null) lines.push(`技術成長: ${scorePct(c.tech_growth_score)}（ウェイト 15%）`);
        if (g != null) lines.push(`キャリア成長: ${scorePct(c.career_growth_score)}（ウェイト 15%）`);
        return lines;
      },
    },
  ];
}

function renderRanking() {
  const axisList   = document.getElementById('ranking-axis-list');
  const detailPane = document.getElementById('ranking-detail');
  if (!axisList || !detailPane) return;

  const axes = buildRankingAxes(selectedCommuteMode);

  // 左：軸セレクターボタンを生成
  axisList.innerHTML = axes.map(axis => `
    <button
      class="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
             ${rankingActiveKey === axis.key
               ? 'bg-indigo-600 text-white shadow-sm'
               : 'text-gray-600 hover:bg-gray-100'}"
      onclick="switchRankingAxis('${axis.key}')">
      <span class="text-base">${axis.emoji}</span>
      <span class="leading-tight">${axis.label}</span>
    </button>
  `).join('');

  // 右：詳細ランキングを描画
  renderRankingDetail(axes);
}

function switchRankingAxis(key) {
  rankingActiveKey = key;
  renderRanking();
}

function renderRankingDetail(axes) {
  const detailPane = document.getElementById('ranking-detail');
  if (!detailPane) return;

  const axis      = axes.find(a => a.key === rankingActiveKey) ?? axes[0];
  const companies = state.companies;
  const MEDALS    = ['🥇', '🥈', '🥉'];

  const sorted = [...companies]
    .map(c => ({ c, val: axis.score(c) }))
    .filter(x => x.val > -1)
    .sort((a, b) => b.val - a.val);

  if (sorted.length === 0) {
    detailPane.innerHTML = `
      <div class="flex items-center justify-center h-48 text-sm text-gray-400 text-center">
        AI分析済みの企業がありません。<br>企業を選択して「AI分析」を実行してください。
      </div>`;
    return;
  }

  const rows = sorted.map((x, i) => {
    const medal   = MEDALS[i] ?? `${i + 1}位`;
    const label   = x.c.name || x.c.url;
    const details = axis.detail(x.c);
    const bgCls   = i === 0 ? 'bg-yellow-50 border-yellow-300'
                 : i === 1  ? 'bg-gray-50 border-gray-200'
                 : i === 2  ? 'bg-orange-50 border-orange-300'
                 :             'bg-white border-gray-200';

    return `
      <div class="rounded-xl border ${bgCls} p-4 cursor-pointer hover:shadow-sm transition-shadow"
           onclick="selectCompanyAndSwitchList(${x.c.id})">
        <div class="flex items-center gap-3 mb-2">
          <span class="text-2xl w-8 flex-shrink-0 text-center">${medal}</span>
          <span class="font-bold text-gray-800">${label}</span>
        </div>
        <ul class="ml-11 space-y-0.5">
          ${details.map(d => `<li class="text-xs text-gray-600">• ${d}</li>`).join('')}
        </ul>
      </div>`;
  }).join('');

  detailPane.innerHTML = `
    <div class="mb-4">
      <h3 class="text-base font-bold text-gray-800">${axis.emoji} ${axis.label}</h3>
      <p class="text-xs text-gray-400 mt-0.5">${axis.desc}</p>
    </div>
    <div class="space-y-3">${rows}</div>`;
}

// ── 共通ユーティリティ ──────────────────────────────────────────────────────

function updateSortIcons(thSel, iconSel, activeCol, asc) {
  document.querySelectorAll(thSel).forEach(th => {
    th.classList.remove('active');
    th.querySelector(iconSel).textContent = '↕';
  });
  const activeTh = document.querySelector(`${thSel}[data-col="${activeCol}"]`);
  if (activeTh) {
    activeTh.classList.add('active');
    activeTh.querySelector(iconSel).textContent = asc ? '↑' : '↓';
  }
}

function selectCompanyAndSwitchList(id) {
  switchView('list');
  selectCompany(id);
}

// ── ビュー切り替え ──────────────────────────────────────────────────────────

function switchView(mode) {
  const sidebar    = document.getElementById('sidebar');
  const detailSec  = document.getElementById('detail-section');
  const compareSec = document.getElementById('comparison-section');
  const btnList    = document.getElementById('btn-view-list');
  const btnCompare = document.getElementById('btn-view-compare');
  const bubble     = document.getElementById('btn-ai-bubble');

  if (mode === 'compare') {
    sidebar.classList.add('hidden');
    detailSec.classList.add('hidden');
    compareSec.classList.remove('hidden');
    btnList.classList.remove('bg-indigo-600', 'text-white');
    btnList.classList.add('bg-white', 'text-gray-500');
    btnCompare.classList.add('bg-indigo-600', 'text-white');
    btnCompare.classList.remove('bg-white', 'text-gray-500');
    // 比較モードでもバブルは常時表示（一括取り込み機能のため）
    // アクティブなタブを再描画
    if (compareState.tab === 'cond') renderComparisonConditions();
    else if (compareState.tab === 'rank') renderRanking();
    else renderComparison();
  } else {
    sidebar.classList.remove('hidden');
    detailSec.classList.remove('hidden');
    compareSec.classList.add('hidden');
    btnList.classList.add('bg-indigo-600', 'text-white');
    btnList.classList.remove('bg-white', 'text-gray-500');
    btnCompare.classList.remove('bg-indigo-600', 'text-white');
    btnCompare.classList.add('bg-white', 'text-gray-500');
    // バブルは常時表示のため非表示→表示の制御は不要
  }
}

document.getElementById('btn-view-list').addEventListener('click',    () => switchView('list'));
document.getElementById('btn-view-compare').addEventListener('click', () => switchView('compare'));

init();

// ════════════════════════════════════════════════════════════════════════════
// AIチャット補完パネル
// ════════════════════════════════════════════════════════════════════════════

const chatState = {
  pendingFiles: [],   // { file, name, mime, previewUrl? }
  pendingUrls:  [],   // string[]
};

// ── バブル表示・非表示 ──────────────────────────────────────────────────────

function showAiBubble(companyName) {
  // ✦ ボタンは常時表示のためここでは company name の更新のみ行う
  document.getElementById('ai-panel-company-name').textContent = companyName;
}

// ── パネル開閉 ──────────────────────────────────────────────────────────────

function openAiPanel() {
  const panel  = document.getElementById('ai-chat-panel');
  const bubble = document.getElementById('btn-ai-bubble');

  // 企業選択有無でパネルのタイトルと案内文を切り替える
  if (state.selectedId) {
    document.getElementById('ai-panel-title').textContent = 'AI情報補完';
    document.getElementById('ai-welcome-text').textContent =
      '求人票・面接メモ・URLなど、どんな情報でも送ってください。企業情報を自動で更新します。';
  } else {
    document.getElementById('ai-panel-title').textContent = 'AI企業取り込み';
    document.getElementById('ai-panel-company-name').textContent = 'テキスト・スクショ・PDF・Excel に対応';
    document.getElementById('ai-welcome-text').textContent =
      '企業情報をテキストで貼り付けるか、スクショ・PDF・Excelをアップロードしてください。AIが自動で取り込みます。';
  }

  bubble.classList.add('morphing');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('ai-chat-input').focus();
}

function closeAiPanel() {
  const panel  = document.getElementById('ai-chat-panel');
  const bubble = document.getElementById('btn-ai-bubble');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    bubble.classList.remove('morphing');
    bubble.classList.add('idle');
  }, 280);
}

// ✦ ボタン → 直接パネルを開く
document.getElementById('btn-ai-bubble').addEventListener('click', openAiPanel);
document.getElementById('btn-ai-panel-close').addEventListener('click', closeAiPanel);
document.getElementById('ai-panel-overlay').addEventListener('click', closeAiPanel);

// Escape キーで閉じる
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('ai-chat-panel').classList.contains('open')) {
    closeAiPanel();
  }
});

// ── ファイル添付 ────────────────────────────────────────────────────────────

document.getElementById('btn-ai-attach').addEventListener('click', () => {
  document.getElementById('ai-file-input').click();
});

document.getElementById('ai-file-input').addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  files.forEach(addAttachment);
  e.target.value = '';
});

function addAttachment(file) {
  const isImage = file.type.startsWith('image/');
  const entry = { file, name: file.name, mime: file.type, previewUrl: null };
  if (isImage) {
    entry.previewUrl = URL.createObjectURL(file);
  }
  chatState.pendingFiles.push(entry);
  renderAttachments();
}

function removeAttachment(idx) {
  const entry = chatState.pendingFiles[idx];
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  chatState.pendingFiles.splice(idx, 1);
  renderAttachments();
}

function renderAttachments() {
  const area = document.getElementById('ai-attachments-preview');
  if (chatState.pendingFiles.length === 0) {
    area.classList.add('hidden');
    area.innerHTML = '';
    return;
  }
  area.classList.remove('hidden');
  area.style.display = 'flex';
  area.style.paddingTop = '10px';
  area.innerHTML = chatState.pendingFiles.map((f, i) => {
    const ext  = f.name.split('.').pop().toUpperCase();
    const icon = f.previewUrl
      ? `<img src="${f.previewUrl}" class="w-full h-full object-cover">`
      : `<span class="text-xs font-bold text-violet-300">${ext}</span>`;
    return `
      <div class="relative group flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden
                  flex items-center justify-center"
           style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12)">
        ${icon}
        <button onclick="removeAttachment(${i})"
          class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full
                 text-white text-xs leading-none flex items-center justify-center
                 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
        <p class="absolute bottom-0 left-0 right-0 text-center text-white text-[9px]
                  bg-black/50 py-0.5 truncate px-1">${f.name.split('/').pop()}</p>
      </div>`;
  }).join('');
}

// ── URL 追加 ────────────────────────────────────────────────────────────────

document.getElementById('btn-ai-url-toggle').addEventListener('click', () => {
  const form = document.getElementById('ai-url-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('ai-url-input').focus();
  }
});

document.getElementById('btn-ai-url-cancel').addEventListener('click', () => {
  document.getElementById('ai-url-form').classList.add('hidden');
  document.getElementById('ai-url-input').value = '';
});

document.getElementById('btn-ai-url-add').addEventListener('click', () => {
  const input = document.getElementById('ai-url-input');
  const url   = input.value.trim();
  if (url) {
    chatState.pendingUrls.push(url);
    renderUrls();
    input.value = '';
    document.getElementById('ai-url-form').classList.add('hidden');
  }
});

document.getElementById('ai-url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-ai-url-add').click();
});

function removeUrl(idx) {
  chatState.pendingUrls.splice(idx, 1);
  renderUrls();
}

function renderUrls() {
  const list = document.getElementById('ai-url-list');
  if (chatState.pendingUrls.length === 0) {
    list.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  list.classList.remove('hidden');
  list.innerHTML = chatState.pendingUrls.map((u, i) => `
    <div class="flex items-center gap-2 text-xs text-violet-300"
         style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2);
                border-radius:8px; padding:4px 8px;">
      <span class="flex-1 truncate">🔗 ${u}</span>
      <button onclick="removeUrl(${i})" class="text-slate-400 hover:text-white transition-colors">✕</button>
    </div>`).join('');
}

// ── チャットメッセージ描画 ──────────────────────────────────────────────────

function addUserMessage(text, fileCount, urlCount) {
  const msgs = document.getElementById('ai-chat-messages');
  const parts = [];
  if (text) parts.push(`<p class="text-sm">${text.replace(/</g,'&lt;')}</p>`);
  if (fileCount) parts.push(`<p class="text-xs opacity-60 mt-0.5">📎 ファイル ${fileCount}件</p>`);
  if (urlCount)  parts.push(`<p class="text-xs opacity-60 mt-0.5">🔗 URL ${urlCount}件</p>`);

  msgs.insertAdjacentHTML('beforeend', `
    <div class="flex justify-end">
      <div class="bg-indigo-600 text-white rounded-xl rounded-tr-none px-3 py-2 max-w-xs">
        ${parts.join('')}
      </div>
    </div>`);
  msgs.scrollTop = msgs.scrollHeight;
}

function addThinkingMessage() {
  const msgs = document.getElementById('ai-chat-messages');
  msgs.insertAdjacentHTML('beforeend', `
    <div id="ai-thinking-msg" class="flex gap-2.5 items-start">
      <div class="ai-orb-sm w-6 h-6 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">✦</div>
      <div class="bg-white/5 rounded-xl rounded-tl-none px-3 py-3">
        <div class="ai-thinking-dots flex gap-1.5 items-center">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`);
  msgs.scrollTop = msgs.scrollHeight;
}

function replaceThinkingWithResult(updatedFields) {
  const thinking = document.getElementById('ai-thinking-msg');
  if (!thinking) return;
  const label = updatedFields.length > 0
    ? `✅ <strong>${updatedFields.length}項目</strong>を更新しました<br>
       <span class="text-xs opacity-60">${updatedFields.join(' · ')}</span>`
    : '更新できる情報は見つかりませんでした。';

  thinking.outerHTML = `
    <div class="flex gap-2.5 items-start">
      <div class="ai-orb-sm w-6 h-6 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">✦</div>
      <div class="text-slate-200 text-sm bg-white/5 rounded-xl rounded-tl-none px-3 py-2 leading-relaxed">${label}</div>
    </div>`;
  document.getElementById('ai-chat-messages').scrollTop = 99999;
}

// ── 更新フィールドのハイライト ──────────────────────────────────────────────

function highlightUpdatedFields(updatedFields) {
  // フィールド名 → 詳細パネル内のセレクタマッピング
  const fieldSelectors = {
    summary:              '.company-summary-text',
    scores:               '#radar-chart',
    strengths_weaknesses: '.strengths-weaknesses-section',
    interview_strategy:   '.interview-strategy-section',
    skill_stack:          '.skill-stack-section',
    hiring_probability_score: '.score-bar-hiring',
    tech_growth_score:    '.score-bar-tech',
    career_growth_score:  '.score-bar-career',
    career_path:          '.career-path-section',
    benefits:             '.benefits-section',
  };
  updatedFields.forEach(field => {
    const sel = fieldSelectors[field];
    if (!sel) return;
    const el = document.querySelector(sel);
    if (el) {
      el.classList.remove('field-updated');
      void el.offsetWidth; // reflow で再発火
      el.classList.add('field-updated');
    }
  });
}

// ── 送信処理 ────────────────────────────────────────────────────────────────

document.getElementById('btn-ai-send').addEventListener('click', sendToAI);
document.getElementById('ai-chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendToAI();
});

async function sendToAI() {
  const input      = document.getElementById('ai-chat-input');
  const sendBtn    = document.getElementById('btn-ai-send');
  const sendLabel  = document.getElementById('ai-send-label');
  const text       = input.value.trim();
  const fileCount  = chatState.pendingFiles.length;
  const urlCount   = chatState.pendingUrls.length;

  if (!text && fileCount === 0 && urlCount === 0) {
    input.focus();
    return;
  }

  // UI をロック
  sendBtn.disabled = true;
  sendLabel.textContent = '送信中...';
  addUserMessage(text, fileCount, urlCount);
  input.value = '';

  const filesSnapshot = [...chatState.pendingFiles];
  const urlsSnapshot  = [...chatState.pendingUrls];
  chatState.pendingFiles = [];
  chatState.pendingUrls  = [];
  renderAttachments();
  renderUrls();
  addThinkingMessage();

  if (state.selectedId) {
    // ── 企業補完モード ─────────────────────────────────────────
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('urls', JSON.stringify(urlsSnapshot));
      filesSnapshot.forEach(f => fd.append('files', f.file, f.name));

      const res = await fetch(`/api/companies/${state.selectedId}/supplement`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'エラーが発生しました');
      }
      const result = await res.json();
      replaceThinkingWithResult(result.updated_fields || []);
      if (result.updated_fields?.length > 0) {
        await selectCompany(state.selectedId);
        setTimeout(() => highlightUpdatedFields(result.updated_fields), 150);
      }
    } catch (err) {
      replaceThinkingWithResult([]);
      showToast(`AI補完エラー: ${err.message}`, 'error');
    } finally {
      sendBtn.disabled = false;
      sendLabel.textContent = '送信';
      filesSnapshot.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    }
  } else {
    // ── 一括取り込みモード ────────────────────────────────────
    try {
      const urlText = urlsSnapshot.length
        ? '\n\n[URL情報]\n' + urlsSnapshot.join('\n')
        : '';
      const fd = new FormData();
      fd.append('text', text + urlText);
      filesSnapshot.forEach(f => fd.append('files', f.file, f.name));

      const res = await fetch('/api/bulk-import/preview', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'エラーが発生しました');
      }
      const data = await res.json();
      const companies = data.companies || [];

      if (!companies.length) {
        replaceThinkingWithBulkResult([]);
      } else {
        replaceThinkingWithBulkResult(companies);
      }
    } catch (err) {
      replaceThinkingWithResult([]);
      showToast(`取り込みエラー: ${err.message}`, 'error');
    } finally {
      sendBtn.disabled = false;
      sendLabel.textContent = '送信';
      filesSnapshot.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    }
  }
}

function replaceThinkingWithBulkResult(companies) {
  const msgs = document.getElementById('ai-chat-messages');
  const thinking = document.getElementById('ai-thinking-msg');

  let bodyHtml;
  if (!companies.length) {
    bodyHtml = '<p class="text-slate-400 text-xs">企業情報を検出できませんでした。より詳しい情報を送ってください。</p>';
  } else {
    const newCount    = companies.filter(c => c.status === 'new').length;
    const updateCount = companies.filter(c => c.status === 'update').length;
    const listHtml = companies.map(c => `
      <div class="flex items-start gap-1.5 py-0.5">
        <span class="text-xs flex-shrink-0 ${c.status === 'update' ? 'text-amber-400' : 'text-green-400'}">
          ${c.status === 'update' ? '🔄' : '🆕'}
        </span>
        <span class="text-slate-200 text-xs leading-snug">
          ${c.name || '（名称不明）'}${c.location ? ` / ${c.location}` : ''}${c.salary ? ` / ${c.salary}` : ''}
        </span>
      </div>`).join('');

    // companies を安全にエスケープして data 属性に渡す
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(companies))));
    bodyHtml = `
      <p class="font-medium text-white mb-2 text-sm">
        ${companies.length}社を検出（新規 ${newCount} / 更新 ${updateCount}）
      </p>
      <div class="space-y-0.5 mb-3">${listHtml}</div>
      <button data-bulk="${encoded}" onclick="registerBulkCompanies(this)"
        class="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs py-1.5 rounded-lg
               font-medium transition-colors">
        ${companies.length}社を登録する
      </button>`;
  }

  const msgEl = document.createElement('div');
  msgEl.className = 'ai-msg-ai flex gap-2.5 items-start';
  msgEl.innerHTML = `
    <div class="ai-orb-sm w-6 h-6 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">✦</div>
    <div class="text-slate-300 text-sm leading-relaxed bg-white/5 rounded-xl rounded-tl-none px-3 py-2.5">
      ${bodyHtml}
    </div>`;

  if (thinking) thinking.replaceWith(msgEl);
  else msgs.appendChild(msgEl);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── 一括AI分析 ────────────────────────────────────────────────────────────────

function updateBulkAnalyzeFooter() {
  const unanalyzed = state.companies.filter(c => c.scores === null);
  const footer = document.getElementById('bulk-analyze-footer');
  const label  = document.getElementById('bulk-analyze-label');
  if (unanalyzed.length > 0) {
    footer.classList.remove('hidden');
    label.textContent = `未分析 ${unanalyzed.length}社を一括分析`;
  } else {
    footer.classList.add('hidden');
  }
}

document.getElementById('btn-bulk-analyze').addEventListener('click', () => {
  const ids = state.companies.filter(c => c.scores === null).map(c => c.id);
  if (ids.length) startBulkAnalyze(ids);
});

async function startBulkAnalyze(ids) {
  const btn   = document.getElementById('btn-bulk-analyze');
  const label = document.getElementById('bulk-analyze-label');
  btn.disabled = true;

  let done = 0;
  let failed = 0;
  let quotaExceeded = false;

  for (const id of ids) {
    label.textContent = `分析中... ${done + failed + 1} / ${ids.length}`;
    try {
      await api(`/api/companies/${id}/analyze`, { method: 'POST' });
      done++;
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
        quotaExceeded = true;
        break;
      }
      failed++;
    }
  }

  btn.disabled = false;
  await loadCompanies();

  if (quotaExceeded) {
    showToast(
      `${done}社を分析後、APIの無料枠（1日20回）に達しました。残り${ids.length - done}社は明日以降に。`,
      'error'
    );
  } else {
    const msg = failed > 0
      ? `${done}社を分析完了（${failed}社はエラー）`
      : `${done}社の分析が完了しました！`;
    showToast(msg, failed > 0 ? 'error' : 'success');
  }
}

window._bulkAnalyzeFromChat = async function(btn, ids) {
  btn.disabled = true;
  btn.textContent = '分析を開始中...';
  await startBulkAnalyze(ids);
  btn.remove();
};

window.registerBulkCompanies = async function(btn) {
  const companies = JSON.parse(decodeURIComponent(escape(atob(btn.dataset.bulk))));
  btn.disabled = true;
  btn.textContent = '登録中...';
  try {
    const res = await fetch('/api/bulk-import/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || '登録に失敗しました');
    const result = await res.json();

    btn.closest('.ai-msg-ai').querySelector('button')?.remove();
    await init();

    const unanalyzedIds = state.companies.filter(c => c.scores === null).map(c => c.id);
    const analyzeBtn = unanalyzedIds.length > 0
      ? `<button onclick="window._bulkAnalyzeFromChat(this, ${JSON.stringify(unanalyzedIds)})"
           class="mt-2 w-full bg-violet-600 hover:bg-violet-500 text-white text-xs py-1.5 rounded-lg
                  font-medium transition-colors">
           ⚡ 未分析 ${unanalyzedIds.length}社をまとめて分析する
         </button>`
      : '';

    const msgs = document.getElementById('ai-chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-msg-ai flex gap-2.5 items-start';
    msgEl.innerHTML = `
      <div class="ai-orb-sm w-6 h-6 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">✦</div>
      <div class="text-slate-300 text-sm bg-white/5 rounded-xl rounded-tl-none px-3 py-2.5">
        ✅ ${result.inserted}社を新規登録・${result.updated}社を更新しました
        ${analyzeBtn}
      </div>`;
    msgs.appendChild(msgEl);
    msgs.scrollTop = msgs.scrollHeight;
  } catch (err) {
    showToast(`登録エラー: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = '登録する';
  }
};

