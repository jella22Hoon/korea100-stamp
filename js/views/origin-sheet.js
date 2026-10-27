// 출발지를 주소나 장소 이름으로 찾아 저장하는 시트(집, 회사 등 최대 5곳)
import { esc, toast, geocode, naverMap } from '../util.js';
import { savedOrigins, addSavedOrigin, removeSavedOrigin, setPlanOrigin } from '../plan.js';

const ext = (href, label) => `<a class="maplink naver" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

/** 출발지를 고르거나 지우면 onChange()를 부른다 */
export function openOriginSheet(onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="os-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 id="os-title">🏠 출발지 정하기</h2>
      <p class="sheet-place">집이나 회사 주소로 출발지를 정하면 이동 시간을 더 가깝게 계산해요</p>

      <label class="field">
        <span>출발지 이름</span>
        <input name="label" maxlength="12" value="${savedOrigins().length ? '' : '집'}" placeholder="예: 집, 회사, 부모님 댁" autocomplete="off">
      </label>
      <div class="field">
        <span>주소나 장소 이름</span>
        <div class="origin-row">
          <input type="search" name="q" maxlength="80" placeholder="예: 마포구 월드컵로 240, 부산역" autocomplete="off" enterkeyhint="search">
          <button type="submit" class="btn small">찾기</button>
        </div>
      </div>
      <div id="os-results" aria-live="polite"></div>
      <div id="os-saved"></div>
      <p class="hint small">주소 검색은 오픈스트리트맵 자료를 써요(찾기를 누를 때만 요청). 위치가 맞는지 '네이버 지도에서 확인'으로 봐 주세요. 길이 좁은 골목이나 새 건물은 못 찾을 수 있어요. 그럴 땐 동 이름이나 근처 역·학교로 찾아 보세요.</p>
      <button type="button" class="btn ghost" data-close style="width:100%">닫기</button>
    </form>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  void overlay.offsetHeight;
  overlay.classList.add('open');

  const form = overlay.querySelector('form');
  const results = form.querySelector('#os-results');
  const savedBox = form.querySelector('#os-saved');

  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 220);
  }

  function paintSaved() {
    const list = savedOrigins();
    savedBox.innerHTML = list.length ? `
      <h3 class="os-h">저장한 출발지</h3>
      <ul class="os-list">${list.map((s) => `
        <li>
          <button type="button" class="os-pick" data-use="${esc(s.id)}"><b>🏠 ${esc(s.name)}</b><span>${esc(s.address)}</span></button>
          ${ext(naverMap(s.address), '<b>N</b> 확인')}
          <button type="button" class="pick-del" data-del="${esc(s.id)}" aria-label="${esc(s.name)} 지우기">✕</button>
        </li>`).join('')}</ul>` : '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = form.elements.q.value.trim();
    if (!q) return;
    results.innerHTML = '<p class="hint small">찾는 중…</p>';
    let list;
    try {
      list = await geocode(q);
    } catch {
      results.innerHTML = '<p class="hint small">찾지 못했어요. 인터넷 연결을 확인해 주세요.</p>';
      return;
    }
    if (!list.length) {
      results.innerHTML = `<p class="hint small">'${esc(q)}'을(를) 찾지 못했어요. 도로명 주소, 동 이름, 근처 역 이름으로 다시 찾아 보세요.</p>
        ${ext(naverMap(q), '<b>N</b> 네이버 지도에서 주소 확인하기')}`;
      return;
    }
    results.innerHTML = `
      <h3 class="os-h">찾은 곳 · 맞는 곳을 골라 주세요</h3>
      <ul class="os-list">${list.map((r, i) => `
        <li>
          <button type="button" class="os-pick" data-i="${i}"><b>${esc(r.address)}</b><span>${r.name && !r.address.includes(r.name) ? `${esc(r.name)} · ` : ''}이 곳으로 정하기</span></button>
          ${ext(naverMap(r.address), '<b>N</b> 확인')}
        </li>`).join('')}</ul>`;
    results.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const r = list[Number(b.dataset.i)];
      const name = form.elements.label.value.trim() || r.address.split(' ').slice(-2).join(' ');
      addSavedOrigin({ name, lat: r.lat, lng: r.lng, address: r.address });
      toast(`'${name}'을(를) 출발지로 정했어요`);
      onChange?.();
      close();
    }));
  });

  savedBox.addEventListener('click', (e) => {
    const use = e.target.closest('[data-use]');
    const del = e.target.closest('[data-del]');
    if (use) {
      setPlanOrigin(`saved:${use.dataset.use}`);
      onChange?.();
      close();
    } else if (del) {
      removeSavedOrigin(del.dataset.del);
      paintSaved();
      onChange?.();
    }
  });

  form.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  paintSaved();
  form.elements.q.focus();
}
