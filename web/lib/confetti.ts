const COLORS = ['#a158ff', '#3DD6C3', '#fdcc02'];
const PARTICLE_COUNT = 60;
const SPREAD = 70;
const GRAVITY = 0.012;
const DRAG = 0.02;
const TICK_LIMIT = 180;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  tick: number;
  shape: 'rect' | 'circle';
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function createParticles(
  originX: number,
  originY: number,
  angle: number,
  count: number,
): Particle[] {
  const radians = (angle * Math.PI) / 180;
  return Array.from({ length: count }, () => {
    const speed = randomBetween(6, 14);
    const spreadRad = ((randomBetween(-SPREAD / 2, SPREAD / 2)) * Math.PI) / 180;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(radians + spreadRad) * speed,
      vy: Math.sin(radians + spreadRad) * speed * -1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: randomBetween(4, 8),
      rotation: randomBetween(0, Math.PI * 2),
      rotationSpeed: randomBetween(-0.15, 0.15),
      tick: 0,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    };
  });
}

function animate(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, particles: Particle[]) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let alive = false;

  for (const p of particles) {
    p.tick++;
    if (p.tick > TICK_LIMIT) continue;
    alive = true;

    p.vy += GRAVITY * p.tick;
    p.vx *= 1 - DRAG;
    p.vy *= 1 - DRAG;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;

    const opacity = Math.max(0, 1 - p.tick / TICK_LIMIT);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    if (p.shape === 'rect') {
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;

  if (alive) {
    requestAnimationFrame(() => animate(canvas, ctx, particles));
  } else {
    canvas.remove();
  }
}

export function fireConfetti() {
  if (typeof window === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;width:100%;height:100%';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const w = canvas.width;
  const h = canvas.height;

  const particles = [
    ...createParticles(0, h * 0.65, -60, PARTICLE_COUNT),
    ...createParticles(w, h * 0.65, -120, PARTICLE_COUNT),
  ];

  animate(canvas, ctx, particles);

  setTimeout(() => {
    const center = createParticles(w / 2, h / 2, -90, Math.round(PARTICLE_COUNT * 0.8));
    for (const p of center) {
      const angle = randomBetween(0, Math.PI * 2);
      const speed = randomBetween(4, 10);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    }
    particles.push(...center);
  }, 250);
}
