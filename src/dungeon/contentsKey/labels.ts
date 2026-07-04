/* ============================================================
   Contents-Key label derivation — pure functions over a Dungeon.

   `relabel` collects every annotated feature, sorts by sequence, and assigns
   reference letters (mutating the features' `ref`, matching the original).
   `esc` HTML-escapes user text before it is inserted via innerHTML (XSS guard).
   Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, MarkerType, Annotatable } from '../model/types';
import { letterFor } from '../rendering/symbols';

export type EntryKind = 'marker' | 'room' | 'sroom' | 'corridor';

/** An annotated feature plus the kind of feature it is. */
export interface AnnotationEntry {
  o: Annotatable & { type?: MarkerType; x?: number; y?: number };
  kind: EntryKind;
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    monster: 'Monster', boss: 'Boss', treasure: 'Treasure', trap: 'Trap', secret: 'Secret Passage', other: 'Other',
  };
  return labels[type] || 'Mark';
}

/** The default label for an entry, before any user-supplied title. */
export function rawLabel(dungeon: Dungeon, entry: AnnotationEntry): string {
  if (entry.kind === 'marker') return typeLabel(entry.o.type!);
  if (entry.kind === 'sroom') return 'Secret Chamber';
  if (entry.kind === 'room') return 'Chamber';
  if (entry.kind === 'corridor') {
    return (dungeon.secretFloor?.[entry.o.y!]?.[entry.o.x!] === 1) ? 'Secret Passage' : 'Corridor';
  }
  return 'Note';
}

export function entryLabel(dungeon: Dungeon, entry: AnnotationEntry): string {
  return entry.o.label ?? rawLabel(dungeon, entry);
}

/** Collect annotated features, sort by sequence, assign reference letters (mutates refs). */
export function relabel(dungeon: Dungeon | null): AnnotationEntry[] {
  if (!dungeon) return [];
  const annotations: AnnotationEntry[] = [];
  (dungeon.markers || []).forEach((marker) => { if (marker.note || marker.label) annotations.push({ o: marker, kind: 'marker' }); });
  (dungeon.rooms || []).forEach((room) => { if (room.note || room.label) annotations.push({ o: room, kind: 'room' }); });
  (dungeon.secretRooms ?? []).forEach((room) => { if (room.note || room.label) annotations.push({ o: room, kind: 'sroom' }); });
  (dungeon.corridorNotes ?? []).forEach((note) => { if (note.note || note.label) annotations.push({ o: note, kind: 'corridor' }); });
  annotations.sort((a, b) => (a.o.seq ?? 0) - (b.o.seq ?? 0));
  let maxSeq = -1;
  annotations.forEach((entry, index) => { entry.o.ref = letterFor(index); if ((entry.o.seq ?? 0) > maxSeq) maxSeq = (entry.o.seq ?? 0); });
  if (dungeon._seq == null || dungeon._seq <= maxSeq) dungeon._seq = maxSeq + 1;
  return annotations;
}

/** HTML-escape user text destined for innerHTML. */
export function esc(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
