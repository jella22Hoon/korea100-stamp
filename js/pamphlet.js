// 함께 가는 사람과 나눌 여행 팜플렛을 외부 파일 없는 HTML 한 장으로 만든다.
import { esc, blogLinks } from './util.js';
import { fmtHours } from './recommend.js';

const SEASON_ICON = { 봄: '🌸', 여름: '🌊', 가을: '🍁', 겨울: '❄️' };
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const SEASON_ITEMS = {
  봄: ['얇은 겉옷 (아침저녁 일교차)', '미세먼지 마스크', '꽃가루 알레르기 약'],
  여름: ['자외선 차단제·모자', '물과 간식', '우산이나 우비 (소나기)', '여벌 옷'],
  가을: ['따뜻한 겉옷 (일교차 큼)', '걷기 편한 신발', '단풍철 주차·혼잡 대비 일찍 출발'],
  겨울: ['두꺼운 외투·장갑·목도리', '핫팩', '미끄럼 방지 신발', '눈길 운전 대비 (체인 등)'],
};

const naverMap = (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
const kakaoMap = (q) => `https://map.kakao.com/?q=${encodeURIComponent(q)}`;

function dayLabel(startDate, i) {
  if (!startDate) return `${i + 1}일차`;
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + i);
  return `${i + 1}일차 · ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
}

function dateRange(startDate, days) {
  if (!startDate) return '';
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(s);
  e.setDate(e.getDate() + days - 1);
  const f = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAY[d.getDay()]})`;
  return days > 1 ? `${f(s)} ~ ${f(e)}` : f(s);
}

function checklist({ season, mode, days }) {
  const items = ['신분증', '휴대폰 충전기·보조배터리', '편한 신발'];
  if (mode === 'air') items.push('항공권 (출발 40분 전 수속)', '렌터카 예약과 운전면허증');
  if (mode === 'ferry') items.push('여객선 예매 (기상 따라 결항 가능, 전날 운항 확인)', '멀미약');
  if (days.flat().some((s) => s.hours >= 6)) items.push('등산화·스틱', '충분한 물과 간식', '산행 탐방 예약 여부 확인');
  if (days.length > 1) items.push('숙소 예약 확인', '세면도구');
  return [...items, ...(SEASON_ITEMS[season] || [])];
}

// 외부 자료(위키백과·한국관광공사)에서 가져온 사진·설명. 출처를 꼭 붙인다
const img = (src, alt, cls) => (/^https:\/\//i.test(src || '')
  ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
const credit = (r, label = '출처') => (r.url && /^https:\/\//i.test(r.url)
  ? `<a class="credit" href="${esc(r.url)}" target="_blank" rel="noopener">${label}: ${esc(r.source)}</a>`
  : `<span class="credit">${label}: ${esc(r.source)}</span>`);

// d: 앱에 들어 있는 한 줄 소개, r: 외부 자료(사진·설명). 한 줄 소개가 있으면 그것을 쓰고 외부 자료는 사진만 붙인다
function pointItem(p, d, r) {
  const text = d || r?.text;
  const pic = r ? img(r.image, p, 'pt-img') : '';
  if (!pic) return `<li class="pt"><b>${esc(p)}</b>${text ? `<p>${esc(text)}</p>` : ''}${!d && r ? credit(r) : ''}</li>`;
  return `
    <li class="pt rich">
      ${pic}
      <div><b>${esc(p)}</b>${text ? `<p>${esc(text)}</p>` : ''}${credit(r, d ? '사진' : '출처')}</div>
    </li>`;
}

function placeCard(s, { season, includePicks }) {
  const g = s.guide || {};
  const q = g.q || s.name;
  const area = s.unverified?.includes('sigungu') || !s.sigungu ? q : s.sigungu;
  const picks = includePicks ? s.picks || [] : [];
  const inSeason = season && g.seasons?.includes(season) && g.seasons.length < 4;
  const info = s.info || { place: null, points: {} };
  const hero = info.place;
  return `
    <article class="place">
      ${hero ? img(hero.image, s.name, 'hero') : ''}
      <h3>${esc(s.name)}</h3>
      <p class="meta">${esc(s.sido)}${s.sigungu ? ` · ${esc(s.sigungu)}` : ''}${g.hours ? ` · 약 ${fmtHours(g.hours)}` : ''}${inSeason ? ` <span class="tag">${SEASON_ICON[season]} ${season} 추천</span>` : ''}</p>
      ${s.custom && s.description ? `<p class="about">${esc(s.description)}</p>`
        : hero?.text ? `<p class="about">${esc(hero.text)} ${credit(hero)}</p>` : ''}
      ${g.points?.length ? `
        <h4>주요 관광 포인트</h4>
        <ul class="pts">${g.points.map((p) => pointItem(p, g.pointDesc?.[p], info.points[p])).join('')}</ul>` : ''}
      ${g.foods?.length ? `
        <h4>꼭 먹어 볼 음식</h4>
        <p class="foods">${g.foods.map((f) => `<a href="${esc(naverMap(`${area} ${f}`))}" target="_blank" rel="noopener">${esc(f)}</a>`).join('')}</p>` : ''}
      <h4>맛집·숙소</h4>
      ${picks.length ? `
        <p class="sub">우리가 찜한 곳</p>
        <ul class="picks">${picks.map((p) => `
          <li><b>${p.type === 'stay' ? '숙소' : '맛집'}</b> ${p.link && /^https?:\/\//i.test(p.link) ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}${p.note ? ` <span>— ${esc(p.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <p class="links">
        <a class="strong" href="${esc(naverMap(`${q} 맛집`))}" target="_blank" rel="noopener">🍽 근처 맛집 (네이버)</a>
        <a class="strong" href="${esc(naverMap(`${q} 숙소`))}" target="_blank" rel="noopener">🛏 근처 숙소 (네이버)</a>
        <a href="${esc(kakaoMap(`${q} 맛집`))}" target="_blank" rel="noopener">카카오 맛집</a>
        <a href="${esc(kakaoMap(`${q} 숙소`))}" target="_blank" rel="noopener">카카오 숙소</a>
      </p>
      <p class="tip">평점이 높은 곳은 지도에서 '리뷰 많은순'이나 '별점순'으로 정렬해 고르세요.</p>
      <h4>블로그 후기</h4>
      <p class="links">${blogLinks(q).map(([label, url, by]) => `<a href="${esc(url)}" target="_blank" rel="noopener">✍️ ${by === 'D' ? '' : '네이버 '}${esc(label)}</a>`).join('')}</p>
      <p class="links">
        <a href="${esc(naverMap(q))}" target="_blank" rel="noopener">📍 위치 (네이버 지도)</a>
        <a href="${esc(kakaoMap(q))}" target="_blank" rel="noopener">📍 카카오맵</a>
      </p>
    </article>`;
}

// 출발지 → 첫 여행지 가는 방법(자동차 경로와 대중교통 어림)
function routeBox(r) {
  if (!r) return '';
  const range = ([a, b]) => `${fmtHours(a)} ~ ${fmtHours(b)}`;
  return `
  <section class="route">
    <h2>🧭 가는 방법</h2>
    <p class="from">${esc(r.from)}${r.fromAddr ? ` <span>(${esc(r.fromAddr)})</span>` : ''} → <b>${esc(r.to)}</b></p>
    <div class="way">
      <h3>🚗 자동차 <span>${r.car ? `약 ${fmtHours(r.car.hours)}` : ''}</span></h3>
      ${r.car ? `<p>${r.car.rough ? '직선거리로 어림한' : '도로 기준'} 약 ${Math.round(r.car.km)}km${r.car.rough ? '' : ' · 막히는 시간은 반영되지 않았어요'}</p>
      ${r.car.roads?.length ? `<p>주로 ${r.car.roads.map(esc).join(' → ')}</p>` : ''}` : '<p>바다를 건너야 해서 자동차 경로는 계산하지 않았어요.</p>'}
    </div>
    <div class="way">
      <h3>${r.transit.kind === 'air' ? '✈️ 비행기·대중교통' : r.transit.kind === 'ferry' ? '⛴ 배·대중교통' : '🚌 대중교통'} <span>대략 ${range(r.transit.hours)}</span></h3>
      <ol>${r.transit.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${r.tickets?.length ? `<p class="links">${r.tickets.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} 예매</a>`).join('')}</p>` : ''}
    </div>
    <p class="links"><a class="strong" href="${esc(naverMap(r.q))}" target="_blank" rel="noopener">📍 네이버 지도에서 길찾기</a></p>
    <p class="tip">대중교통 시간은 거리로 어림한 값이에요. 정확한 노선·배차·요금은 네이버 지도에서 확인하세요.</p>
  </section>`;
}

/**
 * spec: { title, startDate, members:[], note, season, mode, oneWay, originName, includePicks, route,
 *         days: [[{ ...place, guide, picks, leg }]] }
 */
export function buildPamphlet(spec) {
  const { title, startDate, members = [], note, season, mode, oneWay, originName, days, people, route } = spec;
  const range = dateRange(startDate, days.length);
  const places = days.flat();
  const travel = mode === 'air' ? '✈️ 항공 이동'
    : mode === 'ferry' ? '⛴ 여객선 이동'
      : oneWay != null ? `🚗 ${esc(originName || '')} 출발 · 편도 약 ${fmtHours(oneWay)}` : '';
  const made = new Date();
  const LICENSE = { 위키백과: '한국어 위키백과(CC BY-SA 4.0)', 한국관광공사: '한국관광공사 TourAPI' };
  const sources = [...new Set(places.flatMap((p) => [p.info?.place, ...Object.values(p.info?.points || {})])
    .filter(Boolean).map((r) => LICENSE[r.source] || r.source))];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg:#fbf6ef; --paper:#fff; --ink:#2b2320; --ink2:#6f625a; --line:#e7dccd; --accent:#d9622b; --soft:#fbe3d4; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#1c1714; --paper:#27201c; --ink:#f3ebe3; --ink2:#b4a69b; --line:#3d332d; --accent:#f08a52; --soft:#4a2c1d; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif; line-height:1.55; }
.wrap { max-width:720px; margin:0 auto; padding:0 16px 40px; }
.cover { background:linear-gradient(150deg,var(--accent),#b8471a); color:#fff; padding:40px 24px 32px; border-radius:0 0 28px 28px; margin:0 -16px 20px; }
.cover small { opacity:.85; font-weight:700; letter-spacing:.08em; }
.cover h1 { margin:6px 0 10px; font-size:30px; line-height:1.25; word-break:keep-all; }
.cover p { margin:2px 0; opacity:.95; }
.members { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.members span { background:rgb(255 255 255 / 22%); padding:3px 10px; border-radius:999px; font-size:14px; }
.note { background:var(--paper); border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:12px; padding:14px 16px; margin-bottom:18px; white-space:pre-wrap; }
.summary { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
.summary div { flex:1 1 140px; background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:10px 14px; }
.summary b { display:block; font-size:20px; color:var(--accent); }
.summary span { font-size:13px; color:var(--ink2); }
h2 { font-size:18px; margin:28px 0 10px; display:flex; align-items:center; gap:8px; }
h2::before { content:""; width:8px; height:22px; border-radius:4px; background:var(--accent); }
.leg { color:var(--ink2); font-size:13px; margin:6px 0 6px 14px; }
.place { background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:16px 18px; break-inside:avoid; }
.place + .place { margin-top:10px; }
.place h3 { margin:0; font-size:19px; word-break:keep-all; }
.meta { margin:2px 0 0; color:var(--ink2); font-size:14px; }
.tag { display:inline-block; background:var(--soft); color:var(--ink); border-radius:6px; padding:0 6px; font-size:12px; }
h4 { margin:14px 0 4px; font-size:13px; color:var(--accent); }
ul { margin:0; padding-left:18px; }
.foods { margin:0; display:flex; flex-wrap:wrap; gap:6px; }
.foods a { background:var(--soft); color:var(--ink); text-decoration:none; padding:3px 10px; border-radius:999px; font-size:14px; }
.picks { list-style:none; padding:0; }
.picks b { font-size:12px; color:var(--accent); margin-right:4px; }
.picks span { color:var(--ink2); font-size:14px; }
.picks a { color:inherit; }
.hero { display:block; width:calc(100% + 36px); margin:-16px -18px 12px; aspect-ratio:16/9; object-fit:cover; border-radius:16px 16px 0 0; background:var(--soft); }
.about { margin:10px 0 0; font-size:14px; }
.route { background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:16px 18px; margin:14px 0; break-inside:avoid; }
.route h2 { margin:0 0 8px; }
.route .from { margin:0 0 10px; font-size:14px; }
.route .from span { color:var(--ink2); font-size:12px; }
.route .way { border:1px solid var(--line); border-radius:12px; padding:10px 12px; margin-bottom:8px; }
.route .way h3 { margin:0 0 4px; font-size:15px; display:flex; justify-content:space-between; gap:8px; }
.route .way h3 span { color:var(--accent); white-space:nowrap; }
.route .way p, .route .way ol { margin:4px 0; font-size:13px; }
.route .way ol { padding-left:18px; }
.credit { display:inline-block; font-size:11px; color:var(--ink2); text-decoration:none; }
a.credit { text-decoration:underline; }
.pts { list-style:none; padding:0; display:grid; gap:8px; }
.pt { border-left:3px solid var(--soft); padding-left:10px; }
.pt.rich { display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:12px; padding:8px; }
.pt-img { width:88px; height:88px; flex:none; object-fit:cover; border-radius:8px; background:var(--soft); }
.pt p { margin:2px 0; font-size:13px; color:var(--ink2); }
.sub { margin:0 0 2px; font-size:12px; color:var(--ink2); }
.tip { margin:6px 0 0; font-size:12px; color:var(--ink2); }
.links a.strong { border-color:var(--accent); color:var(--accent); font-weight:700; }
.links { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 0; }
.links a { font-size:13px; text-decoration:none; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:4px 10px; }
.empty { color:var(--ink2); background:var(--paper); border:1px dashed var(--line); border-radius:12px; padding:12px 16px; }
.check { list-style:none; padding:0; display:grid; gap:6px; }
.check label { display:flex; gap:8px; align-items:flex-start; background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:8px 12px; }
.check input { accent-color:var(--accent); width:18px; height:18px; margin-top:2px; }
footer { margin-top:32px; color:var(--ink2); font-size:12px; text-align:center; }
@media print {
  :root { --bg:#fff; --paper:#fff; --ink:#000; --ink2:#444; --line:#ccc; --soft:#f3e3d6; color-scheme: light; }
  .cover { -webkit-print-color-adjust:exact; print-color-adjust:exact; border-radius:0; }
  .links, .tip { display:none; }
  h2 { break-after:avoid; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="cover">
    <small>한국관광 100선 여행</small>
    <h1>${esc(title)}</h1>
    ${range ? `<p>📅 ${range}</p>` : ''}
    ${travel ? `<p>${travel}</p>` : ''}
    ${season ? `<p>${SEASON_ICON[season]} ${season} 여행</p>` : ''}
    ${members.length ? `<div class="members">${members.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
  </header>

  ${note ? `<div class="note">${esc(note)}</div>` : ''}

  <section class="summary">
    <div><b>${days.length > 1 ? `${days.length - 1}박 ${days.length}일` : '당일'}</b><span>일정</span></div>
    ${people || members.length ? `<div><b>${Math.max(people || 0, members.length)}명</b><span>인원</span></div>` : ''}
    <div><b>${places.length}곳</b><span>${places.every((p) => !p.custom && !p.spot) ? '한국관광 100선' : '여행지'}</span></div>
    ${places.some((p) => p.guide?.hours) ? `<div><b>약 ${fmtHours(places.reduce((s, p) => s + (p.guide?.hours || 0), 0))}</b><span>관광 시간 합계</span></div>` : ''}
  </section>

  ${routeBox(route)}

  ${days.map((d, i) => `
    <h2>${days.length > 1 ? dayLabel(startDate, i) : (startDate ? dateRange(startDate, 1) : '일정')}</h2>
    ${d.length ? d.map((s, j) => `
      ${j > 0 && s.leg ? `<p class="leg">↓ 차로 약 ${fmtHours(s.leg)}</p>` : ''}
      ${placeCard(s, spec)}`).join('') : `<p class="empty">${i === days.length - 1 ? '돌아오는 날 · 여유롭게 이동해요.' : i === 0 ? '출발하는 날 · 이동 후 숙소 근처를 둘러봐요.' : '자유 일정'}</p>`}`).join('')}

  <h2>준비물 체크리스트</h2>
  <ul class="check">
    ${checklist({ season, mode, days }).map((c) => `<li><label><input type="checkbox"> ${esc(c)}</label></li>`).join('')}
  </ul>

  <footer>
    ${sources.length ? `사진·설명 출처: ${sources.join(', ')}. 자동으로 찾은 자료라 실제와 다를 수 있어요.<br>` : ''}
    이동 시간은 대략 추정한 값이에요. 운영 시간·휴무·예약 여부는 방문 전에 확인하세요.<br>
    ${made.getFullYear()}. ${made.getMonth() + 1}. ${made.getDate()}. 한국관광 100선 스탬프 앱에서 만들었어요.
  </footer>
</div>
</body>
</html>`;
}
