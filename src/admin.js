import { collection, getCountFromServer, getDocs, query, where, orderBy, limit, Timestamp, onSnapshot } from 'firebase/firestore';
import { USAGE_EVENTS } from './usage-events.js';
import { LANGUAGES } from './i18n.js';

// Read on demand; no background listeners or paid server are required.
export async function loadAdminStats(db, now = Date.now()) {
  const profiles = collection(db, 'profiles'), rooms = collection(db, 'rooms'), results = collection(db, 'results');
  const [players, rounds, weekly, dailyRooms, latestRooms, leaders, usageCounts, days, languages] = await Promise.all([
    getCountFromServer(profiles),
    getCountFromServer(results),
    getCountFromServer(query(results, where('completedAt', '>=', Timestamp.fromMillis(now - 7 * 86400000)))),
    getCountFromServer(query(rooms, where('createdAt', '>=', Timestamp.fromMillis(now - 86400000)))),
    getDocs(query(rooms, orderBy('createdAt', 'desc'), limit(12))),
    getDocs(query(profiles, orderBy('gamesPlayed', 'desc'), limit(5))),
    Promise.all(Object.entries(USAGE_EVENTS).map(async ([type, label]) => ({ type, label, count: (await getCountFromServer(query(collection(db, 'usage'), where('type', '==', type)))).data().count }))),
    Promise.all(Array.from({ length: 7 }, async (_, index) => {
      const start = new Date(now); start.setHours(0,0,0,0); start.setDate(start.getDate() - 6 + index);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const count = await getCountFromServer(query(collection(db, 'usage'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<', Timestamp.fromDate(end))));
      return { date: start.getTime(), count: count.data().count };
    })),
    Promise.all(LANGUAGES.map(async language => ({ ...language,
      events: (await getCountFromServer(query(collection(db, 'usage'), where('language', '==', language.code)))).data().count
    })))
  ]);
  return {
    players: players.data().count, rounds: rounds.data().count,
    weekly: weekly.data().count, dailyRooms: dailyRooms.data().count,
    rooms: latestRooms.docs.map(doc => ({ code: doc.id, ...doc.data() })),
    leaders: leaders.docs.map(doc => doc.data()).filter(player => player.gamesPlayed > 0),
    usage: usageCounts, days, languages, loadedAt: now
  };
}

export function watchLiveStats(db, update, error) {
  let entries = [];
  const publish = () => {
    const active = entries.filter(entry => entry.active && entry.updatedAt?.toMillis() > Date.now() - 180000);
    update({ users: new Set(active.map(entry => entry.uid)).size, rooms: new Set(active.map(entry => entry.roomCode).filter(Boolean)).size, capped: entries.length >= 500 });
  };
  const stop = onSnapshot(query(collection(db, 'presence'), where('updatedAt', '>=', Timestamp.fromMillis(Date.now() - 180000)), orderBy('updatedAt', 'desc'), limit(500)), snapshot => {
    entries = snapshot.docs.map(doc => doc.data()); publish();
  }, error);
  const timer = setInterval(publish, 15000);
  return () => { stop(); clearInterval(timer); };
}
