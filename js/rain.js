// Rain for the home sky, seen through a window: faint rain falling behind the glass, drops
// landing on the pane, merging, and the heavy ones running down in fits and starts, picking up
// the drops in their way and leaving a trail of beads. Every shape is drawn once to a sprite,
// so a frame is just a few hundred image copies. Pauses off-screen and in background tabs;
// a still pane for reduced motion.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export function rain(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'rain';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const g = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, raf = 0, last = 0, t = 0, onScreen = false, sinceColor = 0;
  let color = '', sprites = null;
  let streaks = [], beads = [], runners = [], maxBeads = 0, spawn = 0;

  // ---------- sprites ----------
  function sprite(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }
  function makeSprites() {
    // a drop on glass is a small lens: it shows the lighter sky above it upside down, so its
    // lower half is bright, its rim dark, with a glint where the light catches the top
    const drop = sprite(96, (d, s) => {
      const r = s / 2 - 4, c = s / 2;
      let gr = d.createRadialGradient(c, c + r * 0.35, r * 0.2, c, c + r * 0.25, r * 1.25);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      d.fillStyle = gr;
      d.fillRect(0, 0, s, s);
      gr = d.createRadialGradient(c, c + r * 0.45, 0, c, c, r);
      gr.addColorStop(0, `rgba(${color}, 0.5)`);
      gr.addColorStop(0.5, `rgba(${color}, 0.16)`);
      gr.addColorStop(0.8, 'rgba(4, 22, 26, 0.3)');
      gr.addColorStop(1, 'rgba(4, 22, 26, 0.62)');
      d.fillStyle = gr;
      d.beginPath();
      d.arc(c, c, r, 0, TAU);
      d.fill();
      d.strokeStyle = `rgba(${color}, 0.35)`;
      d.lineWidth = s * 0.025;
      d.beginPath();
      d.arc(c, c, r * 0.9, Math.PI * 0.15, Math.PI * 0.85);
      d.stroke();
      d.fillStyle = `rgba(${color}, 0.85)`;
      d.beginPath();
      d.ellipse(c - r * 0.32, c - r * 0.4, r * 0.2, r * 0.13, -0.6, 0, TAU);
      d.fill();
    });
    // a falling streak, soft-edged, brightest towards its lower end
    const streak = document.createElement('canvas');
    streak.width = 6;
    streak.height = 96;
    const s = streak.getContext('2d');
    const gr = s.createLinearGradient(0, 0, 0, 96);
    gr.addColorStop(0, `rgba(${color}, 0)`);
    gr.addColorStop(0.7, `rgba(${color}, 0.55)`);
    gr.addColorStop(1, `rgba(${color}, 0.9)`);
    s.fillStyle = gr;
    s.fillRect(2, 0, 2, 96);
    s.fillStyle = `rgba(${color}, 0.25)`;
    s.fillRect(1, 20, 1, 76);
    s.fillRect(4, 20, 1, 76);
    sprites = { drop, streak };
  }
  function readColor() {
    const c = getComputedStyle(host).getPropertyValue('--sky-text').trim();
    const m = c.match(/^#([0-9a-f]{6})$/i);
    const next = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(', ') : '238, 246, 243';
    if (next !== color) {
      color = next;
      makeSprites();
    }
  }

  // ---------- the scene ----------
  const streak = (y) => {
    const near = Math.random() ** 3; // mostly far away: faint, short and slow
    return { x: rand(-40, W + 40), y: y ?? rand(-H, H), len: 18 + near * 70 + rand(0, 14), v: 700 + near * 900 + rand(0, 200), a: 0.05 + near * 0.22, w: 1 + near * 1.6 };
  };
  const bead = (x, y, r) => ({ x, y, r, born: t });
  function resize() {
    const rc = host.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const first = !W;
    W = rc.width;
    H = rc.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const area = W * H;
    const n = Math.round(Math.min(140, area / 3500));
    while (streaks.length < n) streaks.push(streak());
    streaks.length = n;
    maxBeads = Math.round(Math.min(160, area / 3200));
    if (first) {
      for (let i = 0; i < maxBeads * 0.75; i++) beads.push({ ...bead(rand(0, W), rand(0, H), 1.1 + Math.random() ** 2.2 * 4.6), born: -1 });
    }
    beads = beads.filter((b) => b.x < W + 10 && b.y < H + 10);
  }

  // a new drop lands; if it touches one already there they merge, and a heavy one starts to run
  function land(x, y, r) {
    for (let i = 0; i < beads.length; i++) {
      const b = beads[i];
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (b.r + r) ** 2) {
        const R = Math.hypot(b.r, r);
        b.x = (b.x * b.r * b.r + x * r * r) / (R * R);
        b.y = (b.y * b.r * b.r + y * r * r) / (R * R);
        b.r = R;
        if (R > 5.6) {
          beads.splice(i, 1);
          runners.push({ x: b.x, y: b.y, r: Math.min(R, 8), v: 0, stall: rand(0, 0.4), trail: b.y, sway: rand(0, TAU) });
        }
        return;
      }
    }
    beads.push(bead(x, y, r));
    if (beads.length > maxBeads) beads.splice(Math.max(0, beads.findIndex((b) => b.r < 2)), 1);
  }

  function step(dt) {
    const wind = 0.07 + Math.sin(t * 0.21) * 0.035;
    for (const s of streaks) {
      s.y += s.v * dt;
      s.x += s.v * wind * dt;
      if (s.y - s.len > H) Object.assign(s, streak(-rand(0, 80)));
    }
    spawn += dt * maxBeads * 0.35;
    while (spawn >= 1) {
      spawn--;
      land(rand(0, W), rand(-5, H), 1.1 + Math.random() ** 2.2 * 4.4);
    }
    // now and then a heavy bead gives way under its own weight
    if (runners.length < 5 && Math.random() < dt * 0.9) {
      const i = beads.findIndex((b) => b.r > 4.4 && b.y < H * 0.7 && !b.trail);
      if (i >= 0) {
        const b = beads.splice(i, 1)[0];
        runners.push({ x: b.x, y: b.y, r: b.r, v: 0, stall: rand(0, 0.3), trail: b.y, sway: rand(0, TAU) });
      }
    }
    for (let i = runners.length - 1; i >= 0; i--) {
      const d = runners[i];
      // water sticks to glass, so a run goes in fits: it stalls, then lets go
      if (d.stall > 0) d.stall -= dt;
      else {
        d.v = Math.min(d.v + 500 * dt, 40 + d.r * 22);
        if (Math.random() < dt * 0.9) (d.stall = rand(0.05, 0.5)), (d.v = 0);
      }
      d.y += d.v * dt;
      d.x += Math.sin(t * 3 + d.sway) * 6 * dt + (Math.random() - 0.5) * d.v * 0.02;
      for (let j = beads.length - 1; j >= 0; j--) {
        const b = beads[j];
        if (b.y < d.y - d.r * 0.5) continue;
        const dx = b.x - d.x, dy = b.y - d.y;
        if (dx * dx + dy * dy < (d.r + b.r) ** 2) {
          d.r = Math.min(9, Math.hypot(d.r, b.r * 0.8));
          d.v += 20;
          beads.splice(j, 1);
        }
      }
      if (d.y - d.trail > rand(5, 12)) {
        d.trail = d.y;
        beads.push({ ...bead(d.x + rand(-0.8, 0.8), d.y - d.r * 1.1, d.r * rand(0.14, 0.26)), trail: true });
        d.r = Math.max(4, d.r - 0.04);
      }
      if (d.y - d.r * 2 > H) runners.splice(i, 1);
    }
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const { drop, streak: sp } = sprites;
    const wind = 0.07 + Math.sin(t * 0.21) * 0.035;
    g.save();
    // slant the streaks with the wind: a skew, so x on screen is x + wind·y
    g.transform(1, 0, wind, 1, 0, 0);
    for (const s of streaks) {
      g.globalAlpha = s.a;
      g.drawImage(sp, s.x - s.y * wind - s.w, s.y - s.len, s.w * 2, s.len);
    }
    g.restore();
    for (const b of beads) {
      const grow = b.born < 0 ? 1 : Math.min(1, (t - b.born) / 0.08);
      const r = b.r * grow;
      g.globalAlpha = b.trail ? 0.75 : 0.9;
      g.drawImage(drop, b.x - r, b.y - r * 1.04, r * 2, r * 2.08);
    }
    g.globalAlpha = 1;
    for (const d of runners) {
      // a running drop is pulled into a teardrop, its tail thinner and up behind it
      g.drawImage(drop, d.x - d.r * 0.55, d.y - d.r * 2.3, d.r * 1.1, d.r * 1.6);
      g.drawImage(drop, d.x - d.r, d.y - d.r * 1.15, d.r * 2, d.r * 2.25);
    }
  }

  function frame(now) {
    raf = 0;
    if (!canvas.isConnected) return cleanup();
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    t += dt;
    // the theme can be switched in the app, so pick up the sky colour now and then
    if ((sinceColor += dt) > 1) (sinceColor = 0), readColor();
    step(dt);
    draw();
    if (onScreen && !document.hidden && !still) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || still) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const ro = new ResizeObserver(() => {
    if (!host.isConnected) return;
    readColor();
    resize();
    if (still) draw();
  });
  ro.observe(host);
  let attached = false;
  const io = new IntersectionObserver(([e]) => {
    // rendered before it is on the page, so it only counts as gone once it has been attached
    if (host.isConnected) attached = true;
    else if (attached) return cleanup();
    onScreen = e.isIntersecting;
    onScreen && !document.hidden ? start() : pause();
  });
  io.observe(host);
  const onVis = () => (onScreen && !document.hidden ? start() : pause());
  document.addEventListener('visibilitychange', onVis);
  function cleanup() {
    pause();
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  }
}
