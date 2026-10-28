// 홈 화면에서 입력한 이번 여행 조건(목적지, 출발일, 인원). 여행 기간과 출발지는 '내 여행 일정'과 같은 값을 쓴다.
import { storage } from './util.js';
import { plan, savePlan } from './plan.js';

const TRIP_KEY = 'korea100.trip';

export const trip = { dest: '', startDate: '', people: 2, ...storage.get(TRIP_KEY, {}) };

export function saveTrip(patch = {}) {
  Object.assign(trip, patch);
  if (patch.tripKey) {
    plan.tripKey = patch.tripKey;
    savePlan();
  }
  storage.set(TRIP_KEY, { dest: trip.dest, startDate: trip.startDate, people: trip.people });
}

export const tripKey = () => plan.tripKey;
