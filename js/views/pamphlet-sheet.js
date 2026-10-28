import { state } from '../store.js';
import { getPicks } from '../db.js';
import { buildPamphlet } from '../pamphlet.js';
import { esc, today, toast, downloadFile, storage } from '../util.js';
import { enrichPlaces } from '../enrich.js';
import { trip } from '../trip.js';

const MEMBERS_KEY = 'korea100.members';

function fileName(title) {
  return `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || '여행 팜플렛'}.html`;
}

/**
 * course: { title, season, mode, oneWay, originName, days: [[{ id, leg }]] }
 */
export function openPamphletSheet(course) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2 id="pm-title">📄 여행 팜플렛 만들기</h2>
      <p class="sheet-place">함께 가는 사람에게 보낼 HTML 파일을 만들어요</p>

      <label class="field">
        <span>여행 제목</span>
        <input name="title" maxlength="60" value="${esc(course.title)}" required>
      </label>
      <label class="field">
        <span>출발일 (선택)</span>
        <input type="date" name="startDate" min="${today()}" value="${trip.startDate >= today() ? esc(trip.startDate) : ''}">
      </label>
      <label class="field">
        <span>함께 가는 사람 (쉼표로 구분, 선택)</span>
        <input name="members" maxlength="200" placeholder="예: 엄마, 아빠, 민지" value="${esc(storage.get(MEMBERS_KEY, ''))}">
      </label>
      <label class="field">
        <span>한마디 (선택)</span>
        <textarea name="note" rows="2" maxlength="500" placeholder="예: 토요일 아침 7시 집 앞 출발!"></textarea>
      </label>
      <label class="radio">
        <input type="checkbox" name="picks" checked> 내 맛집·숙소 메모 포함
      </label>
      <label class="radio">
        <input type="checkbox" name="photos" checked> 관광 포인트 사진·설명 넣기 (인터넷 필요)
      </label>
      <p class="hint small" id="pm-status" aria-live="polite"></p>

      <div class="row">
        <button type="button" class="btn ghost" data-act="preview">미리보기</button>
        <button type="button" class="btn ghost" data-act="download">내려받기</button>
      </div>
      <button type="button" class="btn primary big" data-act="share">공유하기</button>
      <button type="button" class="btn ghost" data-act="close" style="width:100%;margin-top:8px">닫기</button>
    </form>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  void overlay.offsetHeight;
  overlay.classList.add('open');

  const form = overlay.querySelector('form');
  const urls = [];
  const status = form.querySelector('#pm-status');

  // 시트를 열자마자 사진·설명을 미리 찾아 둔다(공유 버튼을 누른 뒤 오래 기다리면 공유가 막힐 수 있다)
  const stops = course.days.flat().map((s) => ({ ...state.placeById.get(s.id), guide: state.guide[s.id] }));
  let info = null;
  let enrichJob = null;
  function startEnrich() {
    if (enrichJob) return enrichJob;
    status.textContent = '사진·설명을 찾는 중…';
    enrichJob = enrichPlaces(stops, (d, t) => { status.textContent = `사진·설명을 찾는 중… ${d}/${t}`; })
      .then((r) => {
        info = r;
        const n = Object.values(r).reduce((s, x) => s + (x.place ? 1 : 0) + Object.keys(x.points).length, 0);
        status.textContent = n ? `사진·설명 ${n}건을 찾았어요. 출처가 함께 표시돼요.` : '찾은 사진·설명이 없어요. 이름만 넣을게요.';
      })
      .catch(() => { enrichJob = null; status.textContent = '사진·설명을 불러오지 못했어요. 이름만 넣을게요.'; });
    return enrichJob;
  }
  const photosBox = form.querySelector('[name="photos"]');
  if (photosBox.checked) startEnrich();
  photosBox.addEventListener('change', () => {
    if (photosBox.checked) startEnrich();
    else status.textContent = '';
  });

  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 220);
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000);
  }

  async function build() {
    const fd = new FormData(form);
    const members = String(fd.get('members')).split(',').map((m) => m.trim()).filter(Boolean);
    storage.set(MEMBERS_KEY, members.join(', '));
    const includePicks = fd.get('picks') === 'on';
    const withPhotos = fd.get('photos') === 'on';
    if (withPhotos && !info) await Promise.race([startEnrich(), new Promise((r) => setTimeout(r, 4000))]);
    const days = await Promise.all(course.days.map((d) => Promise.all(d.map(async (s) => ({
      ...state.placeById.get(s.id),
      leg: s.leg || 0,
      guide: state.guide[s.id],
      picks: includePicks ? await getPicks(s.id) : [],
      info: withPhotos ? info?.[s.id] : null,
    })))));
    const title = String(fd.get('title')).trim() || course.title;
    const html = buildPamphlet({
      title,
      startDate: fd.get('startDate') || '',
      people: trip.people,
      members,
      note: String(fd.get('note')).trim(),
      season: course.season,
      mode: course.mode,
      oneWay: course.oneWay,
      originName: course.originName,
      includePicks,
      days,
    });
    return { html, title, name: fileName(title) };
  }

  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') return close();
    if (!form.reportValidity()) return;
    const { html, title, name } = await build();

    if (act === 'preview') {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      urls.push(url);
      if (!window.open(url, '_blank')) toast('팝업이 막혔어요. 내려받기를 이용해 주세요.');
      return;
    }
    if (act === 'download') {
      downloadFile(name, html, 'text/html');
      toast('팜플렛 파일을 내려받았어요');
      return;
    }
    // 공유: 파일 공유를 지원하면 카카오톡 등으로 바로 보내고, 아니면 내려받기
    const file = new File([html], name, { type: 'text/html' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, text: `${title} 여행 팜플렛이에요. 파일을 열어 보세요!` });
      } catch (err) {
        if (err.name !== 'AbortError') toast('공유하지 못했어요. 내려받기를 이용해 주세요.');
      }
    } else {
      downloadFile(name, html, 'text/html');
      toast('이 기기에서는 바로 공유가 안 돼서 파일로 내려받았어요. 메신저에 첨부해 보내 주세요.');
    }
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  form.addEventListener('submit', (e) => e.preventDefault());
}
