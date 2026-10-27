import { state, isUnverified, saveVisit, deleteVisit } from '../store.js';
import { getPhotos, getPicks, savePick, deletePick } from '../db.js';
import { esc, formatDate, stars, today, uid, resizeImage, toast, MAX_PHOTOS } from '../util.js';
import { seasonOf } from '../recommend.js';
import { openPamphletSheet } from './pamphlet-sheet.js';

const NEED = '<span class="need">확인 필요</span>';
const PICK_TYPES = { food: '맛집', stay: '숙소' };

const naverMap = (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
const kakaoMap = (q) => `https://map.kakao.com/?q=${encodeURIComponent(q)}`;
const ext = (href, label, cls = '') => `<a class="maplink ${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 네이버 지도 앱 길찾기. 출발지를 비워 두면 앱이 현재 위치에서 출발하도록 한다.
// 앱이 없거나 PC면 네이버 지도 웹 검색으로 연다(웹에서 '길찾기'를 누르면 된다).
function openRoute(mode, place) {
  const g = state.guide[place.id];
  const q = g?.q || place.name;
  const web = naverMap(q);
  if (!isMobile || !g?.area) {
    window.open(web, '_blank', 'noopener');
    return;
  }
  const [lat, lng] = g.area;
  const params = new URLSearchParams({ dlat: lat, dlng: lng, dname: q, appname: location.hostname || 'korea100' });
  let left = false;
  const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (left || document.hidden) return;
    // 앱 화면을 떠나지 않도록 새 창으로 열고, 팝업이 막히면 현재 창에서 연다
    const w = window.open(web, '_blank');
    if (w) w.opener = null;
    else location.href = web;
  }, 1500);
  location.href = `nmap://route/${mode}?${params}`;
}

function routeSection(place) {
  const q = state.guide[place.id]?.q || place.name;
  return `
    <section class="panel route">
      <h2>위치·교통</h2>
      <p class="hint small route-lead">지도에서 위치를 보거나, 지금 있는 곳에서 가는 길과 시간을 확인해요.</p>
      ${ext(naverMap(q), '<b>N</b> 네이버 지도에서 위치 보기', 'naver wide')}
      <div class="mapgrid">
        <button type="button" class="maplink naver" data-route="public"><span aria-hidden="true">🚌</span> 대중교통으로</button>
        <button type="button" class="maplink naver" data-route="car"><span aria-hidden="true">🚗</span> 자동차로</button>
      </div>
      <p class="hint small">길찾기는 네이버 지도 앱에서 현재 위치를 출발지로 열려요. ${state.guide[place.id]?.areaExact ? '목적지는 받아 둔 관광지 좌표예요. 그래도' : '목적지는 관광지의 대략적인 위치라서,'} 넓은 곳은 앱에서 정확한 입구나 주차장으로 바꿔 주세요. 앱이 없으면 네이버 지도 웹이 열려요.</p>
    </section>`;
}

function guideSection(place) {
  const g = state.guide[place.id];
  const q = g?.q || place.name;
  // 시·군·구가 넓은 범위(○○ 외, 전역)면 음식 검색에 관광지 검색어를 쓴다
  const area = place.unverified?.includes('sigungu') ? q : place.sigungu;
  return `
    <section class="panel guide">
      <h2>여행 정보</h2>
      ${g?.points?.length ? `
        <h3>주요 관광 포인트</h3>
        <ul class="points">${g.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <h3>특산·향토 음식</h3>
      ${g?.foods?.length
        ? `<div class="foods">${g.foods.map((f) => ext(naverMap(`${area} ${f}`), `${esc(f)} <span aria-hidden="true">↗</span>`, 'food')).join('')}</div>
           <p class="hint small">음식 이름을 누르면 근처에서 파는 곳을 네이버지도로 찾아요.</p>`
        : `<p class="hint">대표 향토 음식 정보가 없어요.</p>`}
      <h3>주변 맛집·숙소 찾기</h3>
      <div class="mapgrid">
        ${ext(naverMap(`${q} 맛집`), '<b>N</b> 맛집', 'naver')}
        ${ext(naverMap(`${q} 숙소`), '<b>N</b> 숙소', 'naver')}
        ${ext(kakaoMap(`${q} 맛집`), '<b>K</b> 맛집', 'kakao')}
        ${ext(kakaoMap(`${q} 숙소`), '<b>K</b> 숙소', 'kakao')}
      </div>
      <p class="hint small">지도 앱에서 리뷰 많은 순이나 별점 순으로 정렬하면 평판 좋은 곳을 찾기 쉬워요.</p>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>내 맛집·숙소 메모</h2>
        <button type="button" class="btn small" id="pick-add">+ 추가</button>
      </div>
      <div id="picks"></div>
    </section>
    <button type="button" class="btn pamphlet-btn" id="pamphlet">📄 이곳 여행 팜플렛 만들기</button>`;
}

// 상세 화면. 반환값은 화면을 떠날 때 호출할 정리 함수
export function renderDetail(root, placeId) {
  const place = state.placeById.get(placeId);
  if (!place) {
    root.innerHTML = '<p class="empty">관광지를 찾을 수 없어요. <a href="#/list">목록으로</a></p>';
    return () => {};
  }

  const urls = [];
  const objectURL = (blob) => {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  };
  let photos = [];
  let alive = true;

  async function draw() {
    const visit = state.visits.get(place.id);
    photos = visit ? await getPhotos(place.id) : [];
    if (!alive) return;
    photos.sort((a, b) => visit.photoIds.indexOf(a.id) - visit.photoIds.indexOf(b.id));
    // 설정의 '관광지 정보 새로 받기'로 받아 둔 설명·사진·좌표(출처와 받은 날짜를 함께 표시)
    const info = state.info.items[place.id];
    const at = state.info.updatedAt ? new Date(state.info.updatedAt) : null;
    const sourceName = `${esc(info?.source || '')}${at ? ` · ${at.getMonth() + 1}/${at.getDate()} 기준` : ''}`;
    const source = info ? (info.url && /^https:\/\//i.test(info.url)
      ? `<a class="info-src" href="${esc(info.url)}" target="_blank" rel="noopener noreferrer">출처: ${sourceName}</a>`
      : `<span class="info-src">출처: ${sourceName}</span>`) : '';

    root.innerHTML = `
      <div class="detail${visit ? ' visited' : ''}">
        <a class="back" href="#/list" aria-label="목록으로">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg> 목록
        </a>
        <section class="hero">
          <span class="hero-num">No. ${Number(place.id.slice(1))}</span>
          <h1>${esc(place.name)}</h1>
          <p class="hero-meta">${esc(place.sido)} · ${esc(place.sigungu)}${place.unverified?.includes('sigungu') ? ' ' + NEED : ''} <span class="tag">${esc(place.category)}</span></p>
          ${visit ? '<span class="stamp big">VISITED</span>' : ''}
        </section>

        ${info?.image && /^https:\/\//i.test(info.image) ? `<img class="info-photo" src="${esc(info.image)}" alt="${esc(place.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <dl class="info">
          <div><dt>설명</dt><dd>${!isUnverified(place, 'description') ? esc(place.description)
            : info?.text ? `${esc(info.text)} ${source}` : NEED}</dd></div>
          <div><dt>위치</dt><dd>${!isUnverified(place, 'lat') ? `${place.lat}, ${place.lng}`
            : state.guide[place.id]?.areaExact ? `${state.guide[place.id].area.map((n) => n.toFixed(4)).join(', ')} ${source}`
              : `${NEED} <span class="hint small">관광지 정보를 받으면 정확한 위치로 바뀌어요</span>`}</dd></div>
        </dl>

        ${routeSection(place)}

        ${visit ? `
          <section class="visit-card">
            <h2>나의 방문 기록</h2>
            <p class="visit-date">${formatDate(visit.visitedAt)} <span class="stars" aria-label="별점 ${visit.rating}점">${stars(visit.rating)}</span></p>
            ${visit.memo ? `<p class="memo">${esc(visit.memo)}</p>` : ''}
            ${photos.length ? `<div class="gallery">${photos.map((p) => `<button type="button" class="thumb" data-photo="${p.id}"><img src="${objectURL(p.blob)}" alt="방문 사진"></button>`).join('')}</div>` : ''}
            <div class="row">
              <button type="button" class="btn" id="edit">기록 수정</button>
              <button type="button" class="btn ghost danger" id="remove">기록 취소</button>
            </div>
          </section>` : `
          <button type="button" class="btn primary big" id="check">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> 방문했어요
          </button>`}

        ${guideSection(place)}
      </div>`;

    root.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => openRoute(b.dataset.route, place)));
    root.querySelector('#pick-add').addEventListener('click', () => openPickForm());
    root.querySelector('#pamphlet').addEventListener('click', () => openPamphletSheet({
      title: `${place.name} 여행`,
      season: seasonOf(new Date().getMonth() + 1),
      mode: null,
      oneWay: null,
      days: [[{ id: place.id }]],
    }));
    drawPicks();

    root.querySelector('#check')?.addEventListener('click', () => openSheet(null));
    root.querySelector('#edit')?.addEventListener('click', () => openSheet(visit));
    root.querySelector('#remove')?.addEventListener('click', async () => {
      if (!confirm('이 관광지의 방문 기록과 사진을 삭제할까요?')) return;
      await deleteVisit(place.id);
      toast('방문 기록을 삭제했어요');
      draw();
    });
    root.querySelectorAll('.thumb').forEach((btn) => {
      btn.addEventListener('click', () => openViewer(btn.querySelector('img').src));
    });
  }

  async function drawPicks() {
    const box = root.querySelector('#picks');
    if (!box) return;
    const picks = (await getPicks(place.id)).sort((a, b) => a.type.localeCompare(b.type) || a.createdAt - b.createdAt);
    if (!alive) return;
    box.innerHTML = picks.length ? `<ul class="picks">${picks.map((p) => `
      <li>
        <span class="pick-type ${p.type}">${PICK_TYPES[p.type]}</span>
        <span class="pick-body">
          <span class="pick-name">${p.link ? ext(p.link, `${esc(p.name)} ↗`) : esc(p.name)}</span>
          ${p.note ? `<span class="pick-note">${esc(p.note)}</span>` : ''}
        </span>
        <button type="button" class="pick-del" data-id="${p.id}" aria-label="${esc(p.name)} 삭제">✕</button>
      </li>`).join('')}</ul>`
      : '<p class="hint">가 보고 싶거나 좋았던 맛집·숙소를 저장해 두세요. 지도 앱의 공유 링크를 붙여 넣을 수도 있어요.</p>';
    box.querySelectorAll('.pick-del').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('이 메모를 삭제할까요?')) return;
      await deletePick(b.dataset.id);
      drawPicks();
    }));
  }

  function openPickForm() {
    const box = root.querySelector('#picks');
    if (box.querySelector('.pick-form')) return;
    const form = document.createElement('form');
    form.className = 'pick-form';
    form.innerHTML = `
      <div class="seg" role="radiogroup" aria-label="종류">
        ${Object.entries(PICK_TYPES).map(([v, l], i) => `<label class="chip${i === 0 ? ' active' : ''}"><input type="radio" name="type" value="${v}" ${i === 0 ? 'checked' : ''} class="sr-only">${l}</label>`).join('')}
      </div>
      <input name="name" required maxlength="60" placeholder="가게·숙소 이름" autocomplete="off">
      <input name="note" maxlength="200" placeholder="메모 (추천 메뉴, 가격대 등)" autocomplete="off">
      <input name="link" type="url" maxlength="500" placeholder="지도 링크 (선택)" autocomplete="off">
      <div class="row">
        <button type="button" class="btn ghost" data-cancel>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`;
    box.prepend(form);
    form.querySelector('[name=name]').focus();
    form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => {
      form.querySelectorAll('.seg .chip').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
    }));
    form.querySelector('[data-cancel]').addEventListener('click', () => form.remove());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const link = String(fd.get('link')).trim();
      if (link && !/^https?:\/\//i.test(link)) {
        toast('링크는 http:// 또는 https://로 시작해야 해요');
        return;
      }
      await savePick({
        id: uid('pk'),
        placeId: place.id,
        type: fd.get('type'),
        name: String(fd.get('name')).trim(),
        note: String(fd.get('note')).trim(),
        link,
        createdAt: Date.now(),
      });
      toast('메모를 저장했어요');
      drawPicks();
    });
  }

  function openViewer(src) {
    const v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = `<img src="${src}" alt="방문 사진 크게 보기"><button type="button" class="viewer-close" aria-label="닫기">✕</button>`;
    v.addEventListener('click', () => v.remove());
    document.body.appendChild(v);
  }

  function openSheet(visit) {
    const draft = {
      visitedAt: visit?.visitedAt || today(),
      rating: visit?.rating || 0,
      memo: visit?.memo || '',
      photos: photos.map((p) => ({ id: p.id, blob: p.blob })),
    };

    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.innerHTML = `
      <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <h2 id="sheet-title">${visit ? '방문 기록 수정' : '방문 기록 남기기'}</h2>
        <p class="sheet-place">${esc(place.name)}</p>

        <label class="field">
          <span>방문일</span>
          <input type="date" name="visitedAt" value="${draft.visitedAt}" max="${today()}" required>
        </label>

        <div class="field">
          <span id="rating-label">별점</span>
          <div class="rating" role="radiogroup" aria-labelledby="rating-label">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-n="${n}" aria-label="${n}점">★</button>`).join('')}
          </div>
        </div>

        <label class="field">
          <span>메모</span>
          <textarea name="memo" rows="3" maxlength="1000" placeholder="기억하고 싶은 순간을 적어 보세요">${esc(draft.memo)}</textarea>
        </label>

        <div class="field">
          <span>사진 <small id="photo-count"></small></span>
          <div class="photo-grid" id="photo-grid"></div>
          <input type="file" id="photo-input" accept="image/*" multiple hidden>
        </div>

        <div class="row">
          <button type="button" class="btn ghost" id="cancel">취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    void overlay.offsetHeight; // 시작 위치를 먼저 그려야 열림 전환 효과가 동작한다
    overlay.classList.add('open');

    const form = overlay.querySelector('form');
    const sheetUrls = [];

    function close() {
      overlay.classList.remove('open');
      document.body.classList.remove('no-scroll');
      setTimeout(() => {
        overlay.remove();
        sheetUrls.forEach((u) => URL.revokeObjectURL(u));
      }, 220);
    }

    function paintRating() {
      form.querySelectorAll('.rating button').forEach((b) => {
        const on = Number(b.dataset.n) <= draft.rating;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', Number(b.dataset.n) === draft.rating);
      });
    }

    function paintPhotos() {
      const grid = form.querySelector('#photo-grid');
      grid.innerHTML = draft.photos.map((p, i) => {
        const u = URL.createObjectURL(p.blob);
        sheetUrls.push(u);
        return `<div class="photo"><img src="${u}" alt="선택한 사진 ${i + 1}"><button type="button" data-i="${i}" aria-label="사진 ${i + 1} 삭제">✕</button></div>`;
      }).join('') + (draft.photos.length < MAX_PHOTOS
        ? '<button type="button" class="photo-add" id="photo-add" aria-label="사진 추가"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>'
        : '');
      form.querySelector('#photo-count').textContent = `${draft.photos.length}/${MAX_PHOTOS}`;
      grid.querySelectorAll('.photo button').forEach((b) => b.addEventListener('click', () => {
        draft.photos.splice(Number(b.dataset.i), 1);
        paintPhotos();
      }));
      grid.querySelector('#photo-add')?.addEventListener('click', () => form.querySelector('#photo-input').click());
    }

    form.querySelectorAll('.rating button').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.n);
      draft.rating = draft.rating === n ? 0 : n;
      paintRating();
    }));

    form.querySelector('#photo-input').addEventListener('change', async (e) => {
      const files = [...e.target.files].slice(0, MAX_PHOTOS - draft.photos.length);
      if (e.target.files.length > files.length) toast(`사진은 최대 ${MAX_PHOTOS}장까지 저장돼요`);
      for (const f of files) {
        try {
          draft.photos.push({ id: uid(), blob: await resizeImage(f) });
        } catch {
          toast('사진을 읽지 못했어요');
        }
      }
      e.target.value = '';
      paintPhotos();
    });

    form.querySelector('#cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const record = {
        placeId: place.id,
        visitedAt: fd.get('visitedAt'),
        rating: draft.rating,
        memo: String(fd.get('memo')).trim(),
        createdAt: visit?.createdAt || Date.now(),
      };
      try {
        await saveVisit(record, draft.photos);
      } catch (err) {
        toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
        console.error(err);
        return;
      }
      close();
      await draw();
      if (!visit) stampEffect();
      else toast('기록을 수정했어요');
    });

    paintRating();
    paintPhotos();
  }

  function stampEffect() {
    const s = document.createElement('div');
    s.className = 'stamp-pop';
    s.innerHTML = `<span>VISITED</span><small>${state.visits.size} / ${state.places.length}</small>`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }

  draw();

  return () => {
    alive = false;
    urls.forEach((u) => URL.revokeObjectURL(u));
    document.querySelectorAll('.sheet-overlay, .viewer').forEach((el) => el.remove());
    document.body.classList.remove('no-scroll');
  };
}
