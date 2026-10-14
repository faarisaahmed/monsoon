// Speech: text-to-speech (device voices, with an online fallback), recording your own voice,
// and speech recognition for pronunciation checks.

import { settings } from './store.js';
import { hashStr } from './ui.js';

const synth = window.speechSynthesis;
let voices = [];
function loadVoices() {
  voices = synth ? synth.getVoices() : [];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function voicesFor(tts) {
  const base = tts.split('-')[0].toLowerCase();
  return voices.filter((v) => v.lang.replace('_', '-').toLowerCase().split('-')[0] === base);
}

function pickVoice(tts) {
  const pref = settings().voices?.[tts];
  const list = voicesFor(tts);
  if (pref) {
    const v = list.find((x) => x.voiceURI === pref);
    if (v) return v;
  }
  const exact = list.filter((v) => v.lang.replace('_', '-').toLowerCase() === tts.toLowerCase());
  const pool = exact.length ? exact : list;
  return pool.find((v) => /google|premium|enhanced|natural/i.test(v.name)) || pool[0] || null;
}

export const hasDeviceVoice = (tts) => !!pickVoice(tts);

// ---------- recorded audio ----------
// Every word, phrase and sentence in the course has a pre-generated clip in audio/<code>/.
// audio/<code>/index.json lists which ones exist (by hashStr of the text).
const clips = new Map(); // tts -> { code, set }
export async function loadClips(code, tts) {
  if (clips.has(tts)) return;
  try {
    const r = await fetch(`audio/${code}/index.json`);
    clips.set(tts, { code, set: new Set(r.ok ? await r.json() : []) });
  } catch {
    clips.set(tts, { code, set: new Set() });
  }
}
const clipUrl = (text, tts) => {
  const c = clips.get(tts);
  const key = hashStr(text.trim());
  return c && c.set.has(key) ? `audio/${c.code}/${key}.mp3` : null;
};
const hasClips = (tts) => (clips.get(tts)?.set.size || 0) > 0;

// One shared <audio> element. iOS only lets a page play sound without a tap once an element
// has been started from a tap, so we "unlock" it on the first interaction and reuse it.
const player = new Audio();
player.preload = 'auto';
let unlocked = false;
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMgAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAykAWlpaWlpaWlpaWlpaWlpaWnt7e3t7e3t7e3t7e3t7e3t7nJycnJycnJycnJycnJycnL29vb29vb29vb29vb29vb293t7e3t7e3t7e3t7e3t7e3t7/////////////////////AAAAAExhdmM2Mi4yOAAAAAAAAAAAAAAAACQCowAAAAAAAAMpEpf5vwAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTQuMFVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
function unlock() {
  if (unlocked) return;
  unlocked = true;
  player.src = SILENT;
  player.play().catch(() => (unlocked = false));
}
['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

// Languages Google's public TTS endpoint is known to speak (last-resort fallback).
const ONLINE = new Set(['hi', 'ur', 'bn', 'pa', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'ne']);
export const canSpeak = (tts) => hasClips(tts) || hasDeviceVoice(tts) || (settings().onlineVoice && ONLINE.has(tts.split('-')[0]));

let synthActive = false;
export function stop() {
  if (synth && synthActive) synth.cancel();
  synthActive = false;
  if (!player.paused) player.pause();
}

function playUrl(url, rate) {
  return new Promise((resolve) => {
    player.onended = () => resolve(true);
    player.onerror = () => resolve(false);
    player.src = url;
    player.playbackRate = rate;
    player.preservesPitch = true;
    player.play().catch(() => resolve(false));
  });
}

// Speak text: recorded clip first, then a device voice, then the online voice.
// Resolves true when something played.
export async function speak(text, tts, { rate } = {}) {
  stop();
  rate = rate ?? settings().rate ?? 0.9;
  const url = clipUrl(text, tts);
  // clips are recorded at a learner-friendly pace, so the default rate plays them as-is
  if (url && (await playUrl(url, Math.min(1.4, Math.max(0.5, rate / 0.9))))) return true;
  const voice = pickVoice(tts);
  if (voice && synth) {
    synthActive = true;
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      u.onend = u.onerror = () => resolve(true);
      synth.speak(u);
      // Safari sometimes never fires onend
      setTimeout(() => resolve(true), 1500 + text.length * 180);
    });
  }
  const tl = tts.split('-')[0];
  if (settings().onlineVoice && ONLINE.has(tl)) {
    const online = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(text.slice(0, 190))}`;
    return playUrl(online, Math.min(1.2, Math.max(0.6, rate)));
  }
  return false;
}

// ---------- recording ----------
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function record(maxMs = 6000, onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let raf, ctx;
  if (onLevel && window.AudioContext) {
    ctx = new AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
      onLevel(peak / 128);
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      ctx?.close();
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    };
  });
  rec.start();
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state === 'recording') rec.stop();
    },
    done,
  };
}

// ---------- recognition ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
// languages this browser's recogniser turned out not to support (we switch to record & compare)
const unsupported = new Set();
export const canRecognize = (tts) => !!SR && !unsupported.has(tts);

export function recognize(tts, { timeout = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('Speech recognition is not supported in this browser (try Chrome or Edge).'));
    const r = new SR();
    r.lang = tts;
    r.interimResults = false;
    r.maxAlternatives = 5;
    let finished = false;
    const t = setTimeout(() => r.abort(), timeout);
    r.onresult = (e) => {
      finished = true;
      clearTimeout(t);
      const alts = [...e.results[0]].map((a) => a.transcript.trim());
      resolve(alts);
    };
    r.onerror = (e) => {
      clearTimeout(t);
      if (e.error === 'language-not-supported') unsupported.add(tts);
      if (!finished) reject(new Error(e.error === 'no-speech' ? 'No speech heard — try again a little louder.' : e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'language-not-supported' ? 'Your browser cannot recognise this language — press the mic again to record yourself and compare instead.' : 'Recognition error: ' + e.error));
    };
    r.onend = () => {
      clearTimeout(t);
      if (!finished) resolve([]);
    };
    r.start();
  });
}
