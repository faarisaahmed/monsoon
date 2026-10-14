// Speech: text-to-speech (device voices, with an online fallback), recording your own voice,
// and speech recognition for pronunciation checks.

import { settings } from './store.js';

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

// Languages Google's public TTS endpoint is known to speak.
const ONLINE = new Set(['hi', 'ur', 'bn', 'pa', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'ne']);
export const canSpeak = (tts) => hasDeviceVoice(tts) || (settings().onlineVoice && ONLINE.has(tts.split('-')[0]));

let current = null;
export function stop() {
  if (synth) synth.cancel();
  if (current) {
    current.pause();
    current = null;
  }
}

// Speak text. Resolves when finished (or immediately if no voice is available).
export function speak(text, tts, { rate } = {}) {
  stop();
  rate = rate ?? settings().rate ?? 0.9;
  const voice = pickVoice(tts);
  if (voice && synth) {
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
    return new Promise((resolve) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&ttsspeed=${rate < 0.8 ? 0.4 : 1}&q=${encodeURIComponent(text.slice(0, 190))}`;
      const a = new Audio();
      a.referrerPolicy = 'no-referrer';
      a.src = url;
      a.playbackRate = rate < 0.8 ? 1 : Math.max(0.7, rate);
      current = a;
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
    });
  }
  return Promise.resolve(false);
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
export const canRecognize = () => !!SR;

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
      if (!finished) reject(new Error(e.error === 'no-speech' ? 'No speech heard — try again a little louder.' : e.error === 'not-allowed' ? 'Microphone permission was denied.' : 'Recognition error: ' + e.error));
    };
    r.onend = () => {
      clearTimeout(t);
      if (!finished) resolve([]);
    };
    r.start();
  });
}
