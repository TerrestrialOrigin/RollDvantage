/* ============================================================
   Contents-Key label derivation — pure functions over a Dungeon.

   `relabel` collects every annotated feature, sorts by sequence, and assigns
   reference letters (mutating the features' `referenceLabel`, matching the original).
   `esc` HTML-escapes user text before it is inserted via innerHTML (XSS guard).
   Logic preserved verbatim from the original closure helpers.
   ============================================================ */
import type { Dungeon, MarkerType, Annotatable } from '../model/types';
import { letterFor } from '../rendering/symbols';

export type EntryKind = 'marker' | 'room' | 'secretRoom' | 'corridor';

/** An annotated feature plus the kind of feature it is. */
export interface AnnotationEntry {
  feature: Annotatable & { type?: MarkerType; gridX?: number; gridY?: number };
  kind: EntryKind;
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    monster: 'Monster', boss: 'Boss', treasure: 'Treasure', trap: 'Trap', secret: 'Secret Passage', other: 'Other',
  };
  return labels[type] ?? 'Mark';
}

/** The default label for an entry, before any user-supplied title. */
export function rawLabel(dungeon: Dungeon, entry: AnnotationEntry): string {
  if (entry.kind === 'marker') return typeLabel(entry.feature.type!);
  if (entry.kind === 'secretRoom') return 'Secret Chamber';
  if (entry.kind === 'room') return 'Chamber';
  if (entry.kind === 'corridor') {
    return (dungeon.secretFloor?.[entry.feature.gridY!]?.[entry.feature.gridX!] === 1) ? 'Secret Passage' : 'Corridor';
  }
  return 'Note';
}

export function entryLabel(dungeon: Dungeon, entry: AnnotationEntry): string {
  return entry.feature.label ?? rawLabel(dungeon, entry);
}

/** Collect annotated features, sort by sequence, assign reference letters (mutates referenceLabel). */
export function relabel(dungeon: Dungeon | null): AnnotationEntry[] {
  if (!dungeon) return [];
  const annotations: AnnotationEntry[] = [];
  (dungeon.markers || []).forEach((marker) => { if (marker.note || marker.label) annotations.push({ feature: marker, kind: 'marker' }); });
  (dungeon.rooms || []).forEach((room) => { if (room.note || room.label) annotations.push({ feature: room, kind: 'room' }); });
  (dungeon.secretRooms ?? []).forEach((room) => { if (room.note || room.label) annotations.push({ feature: room, kind: 'secretRoom' }); });
  (dungeon.corridorNotes ?? []).forEach((note) => { if (note.note || note.label) annotations.push({ feature: note, kind: 'corridor' }); });
  annotations.sort((first, second) => (first.feature.sequence ?? 0) - (second.feature.sequence ?? 0));
  let maxSequence = -1;
  annotations.forEach((entry, index) => { entry.feature.referenceLabel = letterFor(index); if ((entry.feature.sequence ?? 0) > maxSequence) maxSequence = (entry.feature.sequence ?? 0); });
  if (dungeon._sequence == null || dungeon._sequence <= maxSequence) dungeon._sequence = maxSequence + 1;
  return annotations;
}

/** HTML-escape user text for both text-node and attribute contexts. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
