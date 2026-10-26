import { state } from '../store.js';
import { SIDO_ORDER, esc, formatDate, stars } from '../util.js';

export function renderProgress(root) {
  const total = state.places.length;
  const done = state.visits.size;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const bySido = new Map();
  state.places.forEach((p) => {
    const s = bySido.get(p.sido) || { total: 0, done: 0 };
    s.total++;
    if (state.visits.has(p.id)) s.done++;
    bySido.set(p.sido, s);
  });
  const rows = SIDO_ORDER.filter((s) => bySido.has(s)).map((s) => ({ sido: s, ...bySido.get(s) }));
  const completed = rows.filter((r) => r.done === r.total).length;

  const recent = [...state.visits.values()]
    .sort((a, b) => (b.visitedAt || '').localeCompare(a.visitedAt || '') || b.updatedAt - a.updatedAt)
    .slice(0, 5);

  // 원형 진행률: r=52 → 둘레 약 326.7
  const C = 2 * Math.PI * 52;

  root.innerHTML = `
    <header class="page-head">
      <h1>진행률</h1>
      <p class="sub">${completed ? `시·도 ${completed}곳 완주` : '첫 시·도 완주를 향해'}</p>
    </header>

    <section class="ring-card">
      <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="전체 ${total}곳 중 ${done}곳 방문, ${pct}퍼센트">
        <circle cx="60" cy="60" r="52" class="ring-bg"/>
        <circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - done / (total || 1))}"/>
      </svg>
      <div class="ring-label">
        <strong>${done}</strong><span>/ ${total}</span>
        <small>${pct}%</small>
      </div>
    </section>

    <section class="panel">
      <h2>시·도별 달성률</h2>
      <ul class="bars">
        ${rows.map((r) => `
          <li class="${r.done === r.total ? 'complete' : ''}">
            <span class="bar-label">${esc(r.sido)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(r.done / r.total) * 100}%"></span></span>
            <span class="bar-value">${r.done}/${r.total}</span>
          </li>`).join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>최근 방문</h2>
      ${recent.length ? `<ul class="recent">${recent.map((v) => {
        const p = state.placeById.get(v.placeId);
        if (!p) return '';
        return `<li><a href="#/place/${p.id}"><span class="recent-name">${esc(p.name)}</span><span class="recent-meta">${formatDate(v.visitedAt)} · <span class="stars">${stars(v.rating)}</span></span></a></li>`;
      }).join('')}</ul>` : '<p class="empty small">아직 방문 기록이 없어요. 목록에서 첫 곳을 골라 보세요.</p>'}
    </section>`;
}
