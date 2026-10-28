import { load } from './store.js';
import { renderHome } from './views/home.js';
import { renderExplore } from './views/explore.js';
import { renderList } from './views/list.js';
import { renderDetail } from './views/detail.js';
import { renderProgress } from './views/progress.js';
import { renderRecommend } from './views/recommend.js';
import { renderSettings, applyTheme } from './views/settings.js';

const view = document.getElementById('view');
let cleanup = null;
const scrollPos = new Map();

function route() {
  const hash = location.hash || '#/home';
  const [, page, id] = hash.split('/');

  scrollPos.set(view.dataset.route, window.scrollY);
  cleanup?.();
  cleanup = null;
  view.dataset.route = hash;

  switch (page) {
    case 'list':
      renderList(view);
      break;
    case 'explore':
      renderExplore(view);
      break;
    case 'place':
      cleanup = renderDetail(view, id);
      break;
    case 'progress':
      renderProgress(view);
      break;
    case 'recommend':
      renderRecommend(view);
      break;
    case 'settings':
      renderSettings(view);
      break;
    default:
      renderHome(view);
  }

  const tab = page === 'place' ? 'list' : page === 'explore' ? 'home' : (page || 'home');
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  window.scrollTo(0, page === 'place' ? 0 : scrollPos.get(hash) || 0);
}

async function start() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
  try {
    await load();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="empty">데이터를 불러오지 못했어요.<br><small>로컬 서버로 실행했는지 확인해 주세요 (README 참고).</small></p>`;
    return;
  }
  // 앱을 새로 열면 홈부터 보여 준다. 예전에 설치한 바로가기는 #/list로 열려서 이것도 홈으로 돌린다
  // (새로고침·뒤로 가기는 보던 화면 그대로)
  const nav = performance.getEntriesByType?.('navigation')?.[0]?.type;
  if (nav !== 'reload' && nav !== 'back_forward' && ['', '#', '#/', '#/list'].includes(location.hash)) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/home`);
  }
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('서비스 워커 등록 실패', e));
  }
}

start();
