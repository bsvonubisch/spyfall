import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

import { USAGE_EVENTS } from './usage-events.js';
const sessionId = crypto.randomUUID();
const storageKey = 'spyfall-usage-queue';
let queue = [], flushing = false, retryTimer, activeUid = null, presenceId = null, roomCode = '', screen = 'home';
let presenceTimer, presenceSoon, lastPresenceAt = 0;
try { queue = JSON.parse(localStorage.getItem(storageKey) || '[]').filter(item => item && USAGE_EVENTS[item.type] && typeof item.uid === 'string').slice(-200); } catch {}
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(queue)); } catch {} }
export function trackUsage(type, detail = {}) {
  const uid = auth.currentUser?.uid;
  if (!uid || !USAGE_EVENTS[type]) return;
  queue.push({ id: crypto.randomUUID(), type, uid, sessionId, screen: detail.screen || screen,
    roomCode: detail.roomCode ?? roomCode, roundId: Number(detail.roundId) || 0,
    device: matchMedia('(max-width: 650px)').matches ? 'mobile' : 'desktop' });
  queue = queue.slice(-200); persist(); void flushUsage();
}
async function flushUsage() {
  if (flushing || !navigator.onLine || !auth.currentUser) return;
  flushing = true; clearTimeout(retryTimer);
  try {
    while (auth.currentUser) {
      const item = queue.find(event => event.uid === auth.currentUser.uid);
      if (!item) break;
      const { id, ...event } = item;
      try { await setDoc(doc(db, 'usage', id), { ...event, source: 'client', createdAt: serverTimestamp() }); }
      catch (error) {
        // A retried, already-created ID is immutable; discard it instead of duplicating it.
        if (error.code !== 'permission-denied') break;
      }
      queue = queue.filter(event => event.id !== id); persist();
    }
  } finally {
    flushing = false;
    if (queue.some(event => event.uid === auth.currentUser?.uid)) retryTimer = setTimeout(flushUsage, 30000);
  }
}
async function presence(active = !document.hidden) {
  if (!activeUid || auth.currentUser?.uid !== activeUid || !presenceId || !navigator.onLine) return;
  lastPresenceAt = Date.now();
  try { await setDoc(doc(db, 'presence', presenceId), { uid: activeUid, sessionId, roomCode, screen, active, updatedAt: serverTimestamp() }); } catch {}
}
export function startUsage(uid) {
  if (activeUid === uid) return;
  activeUid = uid; presenceId = `${sessionId}_${uid}`; lastPresenceAt = 0;
  trackUsage('visit'); void presence(); void flushUsage();
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => { if (!document.hidden) void presence(); }, 90000);
}
export function stopUsage() {
  void presence(false);
  activeUid = null; presenceId = null; clearInterval(presenceTimer); clearTimeout(presenceSoon);
}
export function usageScreen(nextScreen, nextCode = '') {
  const changed = screen !== nextScreen || roomCode !== nextCode;
  screen = nextScreen; roomCode = nextCode;
  if (changed) {
    clearTimeout(presenceSoon);
    presenceSoon = setTimeout(() => void presence(), Math.max(0, 1000 - (Date.now() - lastPresenceAt)));
  }
}
document.addEventListener('visibilitychange', () => { void presence(!document.hidden); if (!document.hidden) void flushUsage(); });
window.addEventListener('online', () => { void presence(); void flushUsage(); });
window.addEventListener('pagehide', () => { void presence(false); });
