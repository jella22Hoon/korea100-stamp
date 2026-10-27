// 100선에 없는 여행지를 추가하거나 고치는 시트
import { saveCustomPlace, refreshOnePlace } from '../store.js';
import { SIDO_ORDER, CATEGORIES, esc, toast } from '../util.js';
import { SEASONS } from '../recommend.js';

const HOURS = [1, 2, 3, 4, 6, 8];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// '이름 - 설명' 한 줄에 하나씩 → [{ n, d }]
function parsePoints(text) {
  const names = new Set();
  return String(text).split('\n').map((line) => {
    const [n, ...rest] = line.split(/\s+-\s+|\s*:\s+/);
    return { n: (n || '').trim().slice(0, 40), d: rest.join(' - ').trim().slice(0, 120) };
  }).filter((x) => x.n && !names.has(x.n) && names.add(x.n)).slice(0, 12);
}

const pointsText = (points = []) => points.map((x) => (x.d ? `${x.n} - ${x.d}` : x.n)).join('\n');

// 오픈스트리트맵에서 이름으로 위치를 찾는다(버튼을 누를 때 한 번만 요청)
async function searchPlace(name, sido, sigungu) {
  const tries = [...new Set([`${name} ${sigungu}`.trim(), name])];
  for (const q of tries) {
    const url = `${NOMINATIM}?${new URLSearchParams({ q, format: 'jsonv2', limit: 5, countrycodes: 'kr', 'accept-language': 'ko' })}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()).map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name }));
    // 고른 시·도 안에 있는 결과를 앞으로
    const inSido = (r) => sido && r.label.includes(sido.slice(0, 2));
    list.sort((a, b) => inSido(b) - inSido(a));
    if (list.length) return list.slice(0, 3);
  }
  return [];
}

/** place가 없으면 새로 추가, 있으면 수정. 저장하면 상세 화면으로 간다. */
export function openPlaceForm(place = null) {
  const p = place || { sido: '', category: '자연', seasons: [...SEASONS], hours: 3 };
  let coords = Number.isFinite(p.lat) ? { lat: p.lat, lng: p.lng, label: p.coordLabel || '' } : null;

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="pf-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 id="pf-title">${place ? '여행지 고치기' : '➕ 여행지 추가'}</h2>
      <p class="sheet-place">100선에 없는 곳도 방문 기록·일정·팜플렛에 똑같이 쓸 수 있어요</p>

      <label class="field">
        <span>이름</span>
        <input name="name" maxlength="40" required value="${esc(p.name || '')}" placeholder="예: 을왕리해수욕장" autocomplete="off">
      </label>
      <div class="row">
        <label class="field">
          <span>시·도</span>
          <select name="sido" required>
            <option value="">선택</option>
            ${SIDO_ORDER.map((s) => `<option ${p.sido === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>시·군·구</span>
          <input name="sigungu" maxlength="20" value="${esc(p.sigungu || '')}" placeholder="예: 중구" autocomplete="off">
        </label>
      </div>
      <div class="field">
        <span>분류</span>
        <div class="seg">${CATEGORIES.map((c) => `<label class="chip${p.category === c ? ' active' : ''}"><input type="radio" class="sr-only" name="category" value="${c}" ${p.category === c ? 'checked' : ''}>${c}</label>`).join('')}</div>
      </div>

      <div class="field">
        <span>위치</span>
        <p class="hint small" id="pf-coord"></p>
        <div class="row">
          <button type="button" class="btn small" id="pf-search">🔍 이름으로 위치 찾기</button>
          <button type="button" class="btn small" id="pf-here">📍 지금 여기</button>
        </div>
        <div id="pf-results"></div>
      </div>

      <label class="field">
        <span>설명 (선택)</span>
        <textarea name="description" rows="2" maxlength="300" placeholder="비워 두면 위키백과 소개를 찾아 보여 드려요">${esc(p.description || '')}</textarea>
      </label>
      <label class="field">
        <span>주요 관광 포인트 (선택, 한 줄에 하나)</span>
        <textarea name="points" rows="3" maxlength="1500" placeholder="예:&#10;해변 산책로 - 노을이 예쁜 곳&#10;조개구이 거리">${esc(pointsText(p.points))}</textarea>
      </label>
      <label class="field">
        <span>특산·향토 음식 (선택, 쉼표로 구분)</span>
        <input name="foods" maxlength="200" value="${esc((p.foods || []).join(', '))}" placeholder="예: 조개구이, 칼국수" autocomplete="off">
      </label>
      <div class="field">
        <span>가기 좋은 계절</span>
        <div class="seg">${SEASONS.map((s) => `<label class="chip${p.seasons?.includes(s) ? ' active' : ''}"><input type="checkbox" class="sr-only" name="seasons" value="${s}" ${p.seasons?.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}</div>
      </div>
      <label class="field">
        <span>둘러보는 데 걸리는 시간</span>
        <select name="hours">${HOURS.map((h) => `<option value="${h}" ${Number(p.hours) === h ? 'selected' : ''}>약 ${h}시간</option>`).join('')}</select>
      </label>

      <div class="row">
        <button type="button" class="btn ghost" data-cancel>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>
    </form>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  void overlay.offsetHeight;
  overlay.classList.add('open');

  const form = overlay.querySelector('form');
  const coordBox = form.querySelector('#pf-coord');
  const results = form.querySelector('#pf-results');

  function paintCoord() {
    coordBox.innerHTML = coords
      ? `✓ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}${coords.label ? ` · ${esc(coords.label)}` : ''} <button type="button" class="linkish" id="pf-clear">지우기</button>`
      : '아직 없어요. 찾지 않으면 시·도의 대략적인 중심으로 거리를 계산해요.';
    coordBox.querySelector('#pf-clear')?.addEventListener('click', () => { coords = null; paintCoord(); });
  }

  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 220);
  }

  form.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('change', () => {
    seg.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
  }));

  form.querySelector('#pf-search').addEventListener('click', async (e) => {
    const name = form.elements.name.value.trim();
    if (!name) {
      toast('이름을 먼저 적어 주세요');
      return;
    }
    e.target.disabled = true;
    results.innerHTML = '<p class="hint small">찾는 중…</p>';
    try {
      const list = await searchPlace(name, form.sido.value, form.sigungu.value.trim());
      results.innerHTML = list.length
        ? `<ul class="pf-results">${list.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.label)}</button></li>`).join('')}</ul>
           <p class="hint small">맞는 곳을 눌러 주세요. 위치 자료: © OpenStreetMap</p>`
        : '<p class="hint small">찾지 못했어요. 다른 이름으로 찾거나 그 자리에서 \'지금 여기\'를 눌러 주세요.</p>';
      results.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const r = list[Number(b.dataset.i)];
        coords = { lat: r.lat, lng: r.lng, label: r.label.split(',').slice(0, 3).join(',') };
        results.innerHTML = '';
        paintCoord();
      }));
    } catch {
      results.innerHTML = '<p class="hint small">위치를 찾지 못했어요. 인터넷 연결을 확인해 주세요.</p>';
    }
    e.target.disabled = false;
  });

  form.querySelector('#pf-here').addEventListener('click', () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      toast('이 화면에서는 위치를 쓸 수 없어요');
      return;
    }
    toast('현재 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition((pos) => {
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치로 저장' };
      paintCoord();
    }, () => toast('위치를 가져오지 못했어요'), { timeout: 15000, maximumAge: 60000 });
  });

  form.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name')).trim();
    const sigungu = String(fd.get('sigungu')).trim();
    const seasons = fd.getAll('seasons');
    const record = {
      id: place?.id || `u${Date.now().toString(36)}`,
      name,
      sido: fd.get('sido'),
      sigungu,
      category: fd.get('category') || '자연',
      description: String(fd.get('description')).trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      coordLabel: coords?.label || '',
      q: sigungu && !name.includes(sigungu) ? `${sigungu} ${name}` : name,
      points: parsePoints(fd.get('points')),
      foods: String(fd.get('foods')).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10),
      seasons: seasons.length ? seasons : [...SEASONS],
      hours: Number(fd.get('hours')) || 3,
      createdAt: place?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const renamed = !place || place.name !== name || place.sido !== record.sido || place.sigungu !== sigungu;
    saveCustomPlace(record);
    close();
    toast(place ? '여행지를 고쳤어요' : '여행지를 추가했어요');
    // 이름이나 지역이 바뀌면 설명·사진을 다시 찾는다(못 찾아도 그대로 쓸 수 있다)
    if (renamed && navigator.onLine !== false) {
      refreshOnePlace(record.id).then((found) => {
        if (found && location.hash === `#/place/${record.id}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    }
    if (location.hash === `#/place/${record.id}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = `#/place/${record.id}`;
  });

  paintCoord();
  form.elements.name.focus();
}
