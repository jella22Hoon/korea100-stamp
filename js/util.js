export const SIDO_ORDER = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

// 추가한 여행지의 위치를 모를 때 쓰는 시·도의 대략적인 중심(거리 추정용, 정확한 좌표 아님)
export const SIDO_CENTER = {
  서울: [37.566, 126.978], 부산: [35.180, 129.075], 대구: [35.871, 128.601], 인천: [37.456, 126.705],
  광주: [35.160, 126.852], 대전: [36.351, 127.385], 울산: [35.539, 129.311], 세종: [36.480, 127.289],
  경기: [37.41, 127.25], 강원: [37.75, 128.30], 충북: [36.80, 127.70], 충남: [36.55, 126.85],
  전북: [35.72, 127.10], 전남: [34.90, 126.90], 경북: [36.35, 128.75], 경남: [35.35, 128.25],
  제주: [33.40, 126.55],
};

export const naverMap = (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`;

// 오픈스트리트맵 주소 정보를 '시·도 시·군·구 도로명 번호' 순서로 만든다. 네이버 지도 검색어로 쓴다.
// 예: { city: 서울특별시, borough: 마포구, road: 월드컵로, house_number: 240 } → '서울특별시 마포구 월드컵로 240'
function koreanAddress(a = {}, name = '') {
  const top = a.province || a.state || a.city || '';
  const local = [a.city !== top ? a.city : '', a.county, a.borough, /(구|군|시)$/.test(a.suburb || '') ? a.suburb : '', a.town]
    .filter(Boolean).filter((x, i, l) => l.indexOf(x) === i);
  const tail = a.road
    ? [a.road, /^\d/.test(a.house_number || '') ? a.house_number : '']
    : [a.village || a.quarter || a.legal || a.suburb || '', name];
  return [top, ...local, ...tail].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(' ');
}

/**
 * 주소나 장소 이름으로 위치를 찾는다(오픈스트리트맵 Nominatim). 버튼을 누를 때만 한 번 요청한다.
 * → [{ lat, lng, label(원래 표기), address(한국식 주소), name(장소 이름) }]
 */
export async function geocode(q, limit = 5) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit, countrycodes: 'kr', 'accept-language': 'ko', addressdetails: 1 })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: r.display_name,
    address: koreanAddress(r.address, r.name) || r.display_name,
    name: r.name || '',
  }));
}

export const CATEGORIES = ['자연', '역사', '문화', '도시', '레저'];

export const MAX_PHOTOS = 5;

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function uid(prefix = 'ph') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}

export function stars(n) {
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

// 사진을 긴 변 maxSide px 이하 JPEG로 줄여 저장 용량을 아낀다
export async function resizeImage(file, maxSide = 1280, quality = 0.82) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* 아래 <img> 방식으로 대체 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

export function downloadFile(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* 저장 불가 환경에서는 무시 */ }
  },
};

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
