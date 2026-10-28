// 출발지를 지도에서 고르거나 주소로 찾아 저장하는 시트(집, 회사 등 최대 5곳)
// 지도는 Leaflet + 오픈스트리트맵 지도(키가 필요 없다). 시트를 열 때만 불러온다.
import { esc, toast, geocode, reverseGeocode, naverMap } from '../util.js';
import { savedOrigins, addSavedOrigin, removeSavedOrigin, setPlanOrigin, planOrigin } from '../plan.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
let leafletJob = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletJob ||= new Promise((ok, fail) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `${LEAFLET}/leaflet.min.js`;
    js.onload = () => ok(window.L);
    js.onerror = () => {
      leafletJob = null;
      fail(new Error('지도를 불러오지 못했어요'));
    };
    document.head.appendChild(js);
  });
  return leafletJob;
}

const ext = (href, label) => `<a class="maplink naver" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

/** 출발지를 고르거나 지우면 onChange()를 부른다 */
export function openOriginSheet(onChange) {
  const start = planOrigin();
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="os-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 id="os-title">🗺 출발지 정하기</h2>
      <p class="sheet-place">지도를 움직여 가운데 ✚ 표시를 출발할 곳에 맞추거나, 주소로 찾아 주세요</p>

      <div class="origin-row">
        <input type="search" name="q" maxlength="80" placeholder="주소·장소 찾기 (예: 부산역)" autocomplete="off" enterkeyhint="search">
        <button type="submit" class="btn small">찾기</button>
      </div>
      <div id="os-results" aria-live="polite"></div>

      <div class="os-map-wrap">
        <div id="os-map" class="os-map" role="application" aria-label="출발지 고르는 지도"><p class="hint small">지도를 불러오는 중…</p></div>
        <span class="os-cross" aria-hidden="true">✚</span>
        <button type="button" class="btn small os-here" id="os-here">📍 내 위치</button>
      </div>
      <p class="os-addr" id="os-addr" aria-live="polite"></p>

      <label class="field">
        <span>출발지 이름</span>
        <input name="label" maxlength="12" value="${savedOrigins().length ? '' : '집'}" placeholder="예: 집, 회사, 부모님 댁" autocomplete="off">
      </label>
      <button type="button" class="btn primary big" id="os-use">✓ 이 위치에서 출발</button>

      <div id="os-saved"></div>
      <p class="hint small">지도·주소 자료: © OpenStreetMap. 찾기를 누르거나 지도를 멈출 때만 주소를 물어봐요. 위치가 맞는지 '네이버 지도에서 확인'으로 볼 수 있어요.</p>
      <button type="button" class="btn ghost" data-close style="width:100%">닫기</button>
    </form>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  void overlay.offsetHeight;
  overlay.classList.add('open');

  const form = overlay.querySelector('form');
  const results = form.querySelector('#os-results');
  const savedBox = form.querySelector('#os-saved');
  const addrBox = form.querySelector('#os-addr');
  let map = null;
  let picked = { lat: start.lat, lng: start.lng, address: start.address || '' };
  let addrTimer = 0;
  let addrSeq = 0;

  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => {
      map?.remove();
      overlay.remove();
    }, 220);
  }

  function paintAddr() {
    addrBox.innerHTML = picked.address
      ? `📍 ${esc(picked.address)} <a href="${esc(naverMap(picked.address))}" target="_blank" rel="noopener noreferrer">네이버 지도에서 확인 ↗</a>`
      : '📍 주소를 찾는 중…';
  }

  // 지도가 멈추면 가운데 점의 주소를 묻는다(오픈스트리트맵 이용 규칙에 맞게 잠시 기다렸다가 한 번만)
  function onMoved() {
    const c = map.getCenter();
    picked = { lat: c.lat, lng: c.lng, address: '' };
    paintAddr();
    clearTimeout(addrTimer);
    const seq = ++addrSeq;
    addrTimer = setTimeout(async () => {
      const a = await reverseGeocode(c.lat, c.lng).catch(() => '');
      if (seq !== addrSeq) return;
      picked.address = a || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
      paintAddr();
    }, 900);
  }

  function moveTo(lat, lng, address = '') {
    if (map) {
      map.setView([lat, lng], Math.max(map.getZoom(), 16));
      if (address) {
        // setView가 moveend를 부르므로 그 뒤에 주소를 덮어쓴다
        setTimeout(() => {
          clearTimeout(addrTimer);
          addrSeq++;
          picked = { lat, lng, address };
          paintAddr();
        }, 0);
      }
    } else {
      picked = { lat, lng, address };
      paintAddr();
    }
  }

  loadLeaflet().then((L) => {
    if (!overlay.isConnected) return;
    const el = form.querySelector('#os-map');
    el.innerHTML = '';
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], start.address ? 16 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    map.on('moveend', onMoved);
    // 시트가 열리는 동안 크기가 바뀌므로 다시 잰다
    setTimeout(() => map.invalidateSize(), 250);
    if (!start.address) onMoved();
    else paintAddr();
  }).catch(() => {
    form.querySelector('#os-map').innerHTML = '<p class="hint small">지도를 불러오지 못했어요. 인터넷 연결을 확인하거나 위의 주소 찾기를 써 주세요.</p>';
    paintAddr();
  });

  function paintSaved() {
    const list = savedOrigins();
    savedBox.innerHTML = list.length ? `
      <h3 class="os-h">저장한 출발지</h3>
      <ul class="os-list">${list.map((s) => `
        <li>
          <button type="button" class="os-pick" data-use="${esc(s.id)}"><b>🏠 ${esc(s.name)}</b><span>${esc(s.address)}</span></button>
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
      // 같은 주소가 여러 번 나오면 하나만 보여 준다
      list = (await geocode(q)).filter((r, i, all) => all.findIndex((x) => x.address === r.address) === i);
    } catch {
      results.innerHTML = '<p class="hint small">찾지 못했어요. 인터넷 연결을 확인해 주세요.</p>';
      return;
    }
    if (!list.length) {
      results.innerHTML = `<p class="hint small">'${esc(q)}'을(를) 찾지 못했어요. 동 이름이나 근처 역 이름으로 찾거나 지도를 직접 움직여 주세요.</p>
        ${ext(naverMap(q), '<b>N</b> 네이버 지도에서 주소 확인하기')}`;
      return;
    }
    results.innerHTML = `
      <ul class="os-list">${list.map((r, i) => `
        <li><button type="button" class="os-pick" data-i="${i}"><b>${esc(r.address)}</b><span>${r.name && !r.address.includes(r.name) ? `${esc(r.name)} · ` : ''}지도에서 보기</span></button></li>`).join('')}</ul>`;
    results.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const r = list[Number(b.dataset.i)];
      results.innerHTML = '';
      moveTo(r.lat, r.lng, r.address);
    }));
  });

  form.querySelector('#os-here').addEventListener('click', () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      toast('이 화면에서는 위치를 쓸 수 없어요');
      return;
    }
    toast('현재 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition(
      (pos) => moveTo(pos.coords.latitude, pos.coords.longitude),
      () => toast('위치를 가져오지 못했어요'),
      { timeout: 15000, maximumAge: 60000 },
    );
  });

  form.querySelector('#os-use').addEventListener('click', () => {
    const name = form.elements.label.value.trim() || '출발지';
    const address = picked.address || `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`;
    addSavedOrigin({ name, lat: picked.lat, lng: picked.lng, address });
    toast(`'${name}'에서 출발해요`);
    onChange?.();
    close();
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
}
