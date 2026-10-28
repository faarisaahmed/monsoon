// The course path: each unit is a row of lessons, then its dialogue and the unit check. Lessons
// open in order, and a unit opens once the one before it is finished (or you pass its check).

import * as store from './store.js';
import * as data from './data.js';

// The steps of a unit, in order: 'l1' … 'lN', 'talk', 'check'.
export const steps = (lessons) => [...lessons.map((l) => 'l' + l.n), 'talk', 'check'];

export function stepDone(code, unitId, step) {
  const us = store.unitState(code, unitId);
  // passing the check (or the older Dialogue tab) counts for the steps before it
  if (us.check) return true;
  if (step === 'talk') return !!(us.talk || us.dialogue);
  return !!us[step];
}

export function unitProgress(code, u, lessons = data.unitLessons(code, u)) {
  const all = steps(lessons);
  const done = all.filter((s) => stepDone(code, u.id, s)).length;
  return { done, total: all.length, complete: !!store.unitState(code, u.id).check };
}

export function unitOpen(code, n) {
  if (n <= 1) return true;
  const us = store.unitState(code, n);
  return Object.keys(us).length > 0 || !!store.unitState(code, n - 1).check;
}

// The first step of a unit you haven't done, or null when the unit is complete.
export function nextStepIn(code, u, lessons = data.unitLessons(code, u)) {
  return steps(lessons).find((s) => !stepDone(code, u.id, s)) || null;
}

// Whether a step can be started yet: lessons in order, then the dialogue, then the check. The
// check is always open, so you can test out of a unit you already know.
export function stepOpen(code, u, lessons, step) {
  if (step === 'check') return true;
  const all = steps(lessons);
  const i = all.indexOf(step);
  return i <= 0 || stepDone(code, u.id, all[i - 1]);
}

// Where to carry on: the first unfinished step of the first open, unfinished unit.
export function nextInCourse(code, units) {
  for (const u of units) {
    if (store.unitState(code, u.id).check) continue;
    if (!unitOpen(code, u.id)) return null;
    const lessons = data.unitLessons(code, u);
    return { u, lessons, step: nextStepIn(code, u, lessons) };
  }
  return null;
}

export function stepHref(code, unitId, step) {
  if (step === 'talk') return `#/l/${code}/u/${unitId}/talk`;
  if (step === 'check') return `#/l/${code}/u/${unitId}/check`;
  return `#/l/${code}/u/${unitId}/lesson/${step.slice(1)}`;
}

export function stepLabel(step, lessons, u) {
  if (step === 'talk') return `Conversation: ${u.dialogue.title}`;
  if (step === 'check') return 'Unit check';
  const l = lessons[+step.slice(1) - 1];
  return `Lesson ${l.n}: ${l.title}`;
}
