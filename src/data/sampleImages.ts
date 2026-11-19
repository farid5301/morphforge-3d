export interface SampleCharacter {
  id: string;
  name: string;
  tag: string;
  recommendedMode: 'puff' | 'relief' | 'lithophane' | 'standee';
  dataUrl: string;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function drawCyberCat(): string {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);

  // Cute stylized chibi cyber cat figurine silhouette with rich shading for 3D relief
  ctx.save();
  ctx.translate(256, 268);

  // Tail
  ctx.beginPath();
  ctx.moveTo(78, 120);
  ctx.bezierCurveTo(165, 110, 178, 15, 130, -10);
  ctx.bezierCurveTo(106, -20, 96, 20, 116, 40);
  ctx.bezierCurveTo(132, 58, 116, 86, 70, 90);
  ctx.closePath();
  const tailGrad = ctx.createLinearGradient(70, 0, 165, 110);
  tailGrad.addColorStop(0, '#c0d4ff');
  tailGrad.addColorStop(1, '#6378b5');
  ctx.fillStyle = tailGrad;
  ctx.fill();

  // Body
  const bodyGrad = ctx.createRadialGradient(-18, 65, 18, 0, 95, 115);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.55, '#c4d4f2');
  bodyGrad.addColorStop(1, '#586996');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 95, 86, 98, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly patch
  const bellyGrad = ctx.createRadialGradient(0, 102, 8, 0, 105, 58);
  bellyGrad.addColorStop(0, '#ffffff');
  bellyGrad.addColorStop(1, '#a5b7de');
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 108, 48, 56, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  for (const sx of [-42, 42]) {
    const fGrad = ctx.createRadialGradient(sx - 6, 168, 5, sx, 175, 34);
    fGrad.addColorStop(0, '#ffffff');
    fGrad.addColorStop(1, '#6879a8');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.ellipse(sx, 176, 32, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arms
  for (const sx of [-78, 78]) {
    const aGrad = ctx.createRadialGradient(sx * 0.9, 60, 6, sx, 72, 42);
    aGrad.addColorStop(0, '#ffffff');
    aGrad.addColorStop(1, '#6273a3');
    ctx.fillStyle = aGrad;
    ctx.beginPath();
    ctx.ellipse(sx, 72, 28, 42, sx < 0 ? 0.35 : -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ears
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 32, -148);
    ctx.lineTo(dir * 102, -214);
    ctx.lineTo(dir * 108, -96);
    ctx.closePath();
    const earGrad = ctx.createLinearGradient(dir * 32, -210, dir * 100, -100);
    earGrad.addColorStop(0, '#f3f7ff');
    earGrad.addColorStop(1, '#6d7fb2');
    ctx.fillStyle = earGrad;
    ctx.fill();

    // Inner ear
    ctx.beginPath();
    ctx.moveTo(dir * 48, -142);
    ctx.lineTo(dir * 90, -186);
    ctx.lineTo(dir * 92, -112);
    ctx.closePath();
    ctx.fillStyle = '#48557d';
    ctx.fill();
  }

  // Head
  const headGrad = ctx.createRadialGradient(-28, -95, 20, 0, -68, 132);
  headGrad.addColorStop(0, '#ffffff');
  headGrad.addColorStop(0.58, '#d4e0fa');
  headGrad.addColorStop(1, '#5d6d9e');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, -68, 122, 108, 0, 0, Math.PI * 2);
  ctx.fill();

  // Visor goggles on forehead
  const visorGrad = ctx.createLinearGradient(-84, -145, 84, -105);
  visorGrad.addColorStop(0, '#ffffff');
  visorGrad.addColorStop(0.5, '#7691d4');
  visorGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = visorGrad;
  ctx.beginPath();
  ctx.roundRect(-84, -142, 168, 40, 20);
  ctx.fill();

  // Eyes (deep dark contrast -> sculpted sockets)
  for (const sx of [-46, 46]) {
    ctx.fillStyle = '#1d243b';
    ctx.beginPath();
    ctx.ellipse(sx, -56, 22, 27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx - 6, -65, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + 7, -47, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cute Nose & Smile
  ctx.fillStyle = '#ff9bc0';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(-10, -34);
  ctx.lineTo(10, -34);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#2d3756';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-12, -16, 12, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, -16, 12, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Chest Core Emblem
  const coreGrad = ctx.createRadialGradient(0, 62, 2, 0, 62, 18);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 62, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  return c.toDataURL('image/png');
}

function drawMechaBot(): string {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 260);

  // Antenna
  ctx.fillStyle = '#d7e3ff';
  ctx.fillRect(-8, -214, 16, 56);
  const orb = ctx.createRadialGradient(-4, -218, 3, 0, -216, 20);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(1, '#5670b8');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(0, -216, 20, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  for (const sx of [-48, 48]) {
    const lg = ctx.createLinearGradient(sx - 24, 90, sx + 24, 200);
    lg.addColorStop(0, '#f0f6ff');
    lg.addColorStop(1, '#586996');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.roundRect(sx - 26, 95, 52, 95, 18);
    ctx.fill();
  }

  // Arms
  for (const sx of [-120, 120]) {
    const ag = ctx.createLinearGradient(sx - 22, -20, sx + 22, 110);
    ag.addColorStop(0, '#ffffff');
    ag.addColorStop(1, '#5a6b99');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.roundRect(sx - 24, -18, 48, 116, 22);
    ctx.fill();
  }

  // Torso armor
  const tg = ctx.createRadialGradient(-20, 10, 18, 0, 35, 110);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(0.6, '#b8caef');
  tg.addColorStop(1, '#4c5c88');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.roundRect(-88, -32, 176, 146, 36);
  ctx.fill();

  // Chest reactor
  ctx.fillStyle = '#25314f';
  ctx.beginPath();
  ctx.roundRect(-48, 4, 96, 60, 16);
  ctx.fill();
  const rg = ctx.createRadialGradient(0, 34, 4, 0, 34, 26);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(1, '#6892ff');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(0, 34, 22, 0, Math.PI * 2);
  ctx.fill();

  // Head Helmet
  const hg = ctx.createRadialGradient(-26, -135, 16, 0, -108, 115);
  hg.addColorStop(0, '#ffffff');
  hg.addColorStop(0.55, '#c6d6f6');
  hg.addColorStop(1, '#4d5d8c');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(-102, -172, 204, 132, 46);
  ctx.fill();

  // Face Screen
  ctx.fillStyle = '#1b233b';
  ctx.beginPath();
  ctx.roundRect(-78, -142, 156, 74, 24);
  ctx.fill();

  // Glowing LED eyes
  ctx.fillStyle = '#ffffff';
  for (const sx of [-36, 36]) {
    ctx.beginPath();
    ctx.roundRect(sx - 18, -118, 36, 26, 12);
    ctx.fill();
  }

  ctx.restore();
  return c.toDataURL('image/png');
}

function drawDragonMedallion(): string {
  const [c, ctx] = makeCanvas(512);
  // Rich high-contrast emblem ideal for Bas-Relief & Lithophane
  const bg = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
  bg.addColorStop(0, '#4a5568');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  ctx.save();
  ctx.translate(256, 256);

  // Outer sculpted ring
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(0, 0, 212, 0, Math.PI * 2);
  ctx.stroke();

  // Sunburst rays
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 8);
    const ray = ctx.createLinearGradient(0, -195, 0, -115);
    ray.addColorStop(0, '#f8fafc');
    ray.addColorStop(1, '#64748b');
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(0, -195);
    ctx.lineTo(-14, -120);
    ctx.lineTo(14, -120);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Stylized Phoenix / Crest wings
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir, 1);
    const wg = ctx.createLinearGradient(0, -80, 160, 100);
    wg.addColorStop(0, '#ffffff');
    wg.addColorStop(0.6, '#cbd5e1');
    wg.addColorStop(1, '#475569');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(14, 24);
    ctx.bezierCurveTo(60, -90, 155, -105, 168, -22);
    ctx.bezierCurveTo(155, 25, 115, 76, 30, 82);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Center Crowned Shield
  const sg = ctx.createRadialGradient(-16, -24, 10, 0, 0, 105);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.65, '#cbd5e1');
  sg.addColorStop(1, '#475569');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(0, -116);
  ctx.lineTo(82, -52);
  ctx.lineTo(66, 56);
  ctx.lineTo(0, 122);
  ctx.lineTo(-66, 56);
  ctx.lineTo(-82, -52);
  ctx.closePath();
  ctx.fill();

  // Inner Star Gem
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 52 : 22;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  return c.toDataURL('image/png');
}

function drawGhostChibi(): string {
  const [c, ctx] = makeCanvas(512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 260);

  // Cute chunky Halloween ghost figurine
  const g = ctx.createRadialGradient(-38, -75, 20, 0, 10, 210);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#dce6ff');
  g.addColorStop(1, '#6879a8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-136, 150);
  ctx.bezierCurveTo(-152, -20, -140, -190, 0, -190);
  ctx.bezierCurveTo(140, -190, 152, -20, 136, 150);
  ctx.quadraticCurveTo(96, 198, 56, 156);
  ctx.quadraticCurveTo(0, 202, -56, 156);
  ctx.quadraticCurveTo(-96, 198, -136, 150);
  ctx.closePath();
  ctx.fill();

  // Little side nub arms
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * 140, 14, 34, 24, dir * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crown on head
  const cg = ctx.createLinearGradient(-44, -220, 44, -155);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(1, '#9fb5eb');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-46, -162);
  ctx.lineTo(-56, -218);
  ctx.lineTo(-18, -190);
  ctx.lineTo(0, -230);
  ctx.lineTo(18, -190);
  ctx.lineTo(56, -218);
  ctx.lineTo(46, -162);
  ctx.closePath();
  ctx.fill();

  // Eyes & Happy Mouth
  ctx.fillStyle = '#1b243c';
  ctx.beginPath();
  ctx.ellipse(-44, -42, 20, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(44, -42, 20, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-50, -50, 7, 0, Math.PI * 2);
  ctx.arc(38, -50, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#253152';
  ctx.beginPath();
  ctx.ellipse(0, 14, 26, 20, 0, 0, Math.PI);
  ctx.fill();

  ctx.restore();
  return c.toDataURL('image/png');
}

let cachedSamples: SampleCharacter[] | null = null;

export function getSampleCharacters(): SampleCharacter[] {
  if (cachedSamples) return cachedSamples;
  cachedSamples = [
    {
      id: 'cyber-cat',
      name: 'Cyber Cat',
      tag: 'Chibi Figurine',
      recommendedMode: 'puff',
      dataUrl: drawCyberCat(),
    },
    {
      id: 'mecha-bot',
      name: 'Nova Bot',
      tag: 'Mecha Toy',
      recommendedMode: 'puff',
      dataUrl: drawMechaBot(),
    },
    {
      id: 'royal-crest',
      name: 'Solar Crest',
      tag: 'Coin & Relief',
      recommendedMode: 'relief',
      dataUrl: drawDragonMedallion(),
    },
    {
      id: 'king-ghost',
      name: 'King Boo',
      tag: 'Desk Figurine',
      recommendedMode: 'puff',
      dataUrl: drawGhostChibi(),
    },
  ];
  return cachedSamples;
}
