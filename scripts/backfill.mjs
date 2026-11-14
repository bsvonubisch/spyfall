// Owner-only maintenance. Dry-run by default; uses the existing Firebase CLI login.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { getGlobalDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth');
const account = getGlobalDefaultAccount();
if (!account) throw new Error('Sign in with the Firebase CLI first.');
const tokens = account.tokens.expires_at > Date.now() + 60000 ? account.tokens : await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const project = 'vu-spyfall', base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const apply = process.argv.includes('--apply');
const headers = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' };
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) { const error = new Error(`${response.status}: ${data.error?.message || 'Firestore request failed'}`); error.status = response.status; error.code = data.error?.status; throw error; }
  return data;
}
async function list(path) {
  const docs = []; let pageToken = '';
  do {
    const result = await api(`/${path}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    docs.push(...(result.documents || [])); pageToken = result.nextPageToken;
  } while (pageToken);
  return docs;
}
const str = value => ({ stringValue: value });
const num = value => ({ integerValue: String(value) });
const time = value => ({ timestampValue: value });
const val = field => field?.stringValue;
const now = new Date().toISOString();
const [profiles, rooms, results, usage] = await Promise.all(['profiles','rooms','results','usage'].map(list));
const originals = [...profiles, ...rooms, ...results], writes = [], totals = { profiles: 0, roomAvatars: 0, resultAvatars: 0, roomScores: 0, savedLocationLists: 0, historicalRoomCreations: 0 };
function update(document, fields, category) {
  if (!Object.keys(fields).length) return;
  writes.push({ update: { name: document.name, fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: document.updateTime } }); totals[category]++;
}
function missingAvatar(fields, id) {
  return { ...(!fields.avatarSeed ? { avatarSeed: str(id) } : {}), ...(!fields.avatarUrl ? { avatarUrl: str('') } : {}) };
}
for (const profile of profiles) update(profile, missingAvatar(profile.fields, profile.name.split('/').at(-1)), 'profiles');
for (const [documents, category] of [[rooms,'roomAvatars'],[results,'resultAvatars']]) for (const document of documents) {
  const players = document.fields.players?.mapValue?.fields; if (!players) continue;
  let changed = false; const next = structuredClone(players);
  for (const [id, player] of Object.entries(next)) {
    const missing = missingAvatar(player.mapValue.fields, id);
    if (Object.keys(missing).length) { Object.assign(player.mapValue.fields, missing); changed = true; }
  }
  if (changed) update(document, { players: { mapValue: { fields: next } } }, category);
}
for (const room of rooms) {
  const code = room.name.split('/').at(-1);
  const scores = await list(`rooms/${code}/scores`); originals.push(...scores);
  for (const score of scores) update(score, missingAvatar(score.fields, score.name.split('/').at(-1)), 'roomScores');
  const exists = usage.some(event => val(event.fields.type) === 'room_created' && val(event.fields.roomCode) === code);
  if (!exists && room.fields.createdAt?.timestampValue) {
    writes.push({ update: { name: `${base.slice('https://firestore.googleapis.com/v1/'.length)}/usage/backfill_room_${code}`, fields: {
      type: str('room_created'), source: str('backfill'), roomCode: str(code), createdAt: room.fields.createdAt,
      actorUnknown: { booleanValue: true }, backfilledAt: time(now)
    } }, currentDocument: { exists: false } }); totals.historicalRoomCreations++;
  }
}
// Recover the latest list for a current host only; existing preferences always win.
const hosts = new Map();
for (const room of [...rooms].sort((a,b) => (b.fields.createdAt?.timestampValue || '').localeCompare(a.fields.createdAt?.timestampValue || ''))) {
  const host = val(room.fields.hostId); if (host && !hosts.has(host)) hosts.set(host, room);
}
for (const [host, room] of hosts) {
  const path = `/profiles/${encodeURIComponent(host)}/preferences/game`;
  try { originals.push(await api(path)); continue; } catch (error) { if (error.status !== 404) throw error; }
  const locations = room.fields.settings?.mapValue?.fields?.locations;
  const names = locations?.arrayValue?.values?.map(val) || [];
  if (names.length < 3 || names.length > 40 || names.some(name => !name || name.length > 40) || new Set(names.map(name => name.toLowerCase())).size !== names.length) continue;
  writes.push({ update: { name: `${base.slice('https://firestore.googleapis.com/v1/'.length)}${path}`, fields: { locations, updatedAt: time(now) } }, currentDocument: { exists: false } }); totals.savedLocationLists++;
}
const output = resolve('../work/firestore-backfill', now.replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
await writeFile(`${output}/before.json`, JSON.stringify(originals, null, 2));
await writeFile(`${output}/plan.json`, JSON.stringify(writes, null, 2));
const report = { mode: apply ? 'apply' : 'dry-run', scanned: { profiles: profiles.length, rooms: rooms.length, results: results.length }, planned: totals, applied: 0, conflicts: 0 };
if (apply) for (const write of writes) {
  try { await api(':commit', { method: 'POST', body: JSON.stringify({ writes: [write] }) }); report.applied++; }
  catch (error) { if ([409,412].includes(error.status) || ['FAILED_PRECONDITION','ALREADY_EXISTS','ABORTED'].includes(error.code)) report.conflicts++; else throw error; }
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
