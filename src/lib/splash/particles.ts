export interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

export function createLeafParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: 3 + Math.random() * 5,
    speedX: (Math.random() - 0.5) * 0.3,
    speedY: 0.2 + Math.random() * 0.4,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    opacity: 0.15 + Math.random() * 0.25,
  }))
}

export function createSnowParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: 0.5 + Math.random() * 1.5,
    speedX: (Math.random() - 0.5) * 0.2,
    speedY: 0.1 + Math.random() * 0.3,
    rotation: 0,
    rotationSpeed: 0,
    opacity: 0.2 + Math.random() * 0.4,
  }))
}

export function updateParticle(p: Particle, w: number, h: number): void {
  p.x += p.speedX
  p.y += p.speedY
  p.rotation += p.rotationSpeed

  if (p.y > h + p.size) { p.y = -p.size; p.x = Math.random() * w }
  if (p.x < -p.size) p.x = w + p.size
  if (p.x > w + p.size) p.x = -p.size
}

export function drawLeaf(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rotation)
  ctx.globalAlpha = p.opacity
  ctx.fillStyle = '#c22'
  ctx.beginPath()
  ctx.moveTo(0, -p.size)
  ctx.quadraticCurveTo(p.size * 0.8, -p.size * 0.3, p.size * 0.4, p.size * 0.5)
  ctx.lineTo(0, p.size * 0.3)
  ctx.lineTo(-p.size * 0.4, p.size * 0.5)
  ctx.quadraticCurveTo(-p.size * 0.8, -p.size * 0.3, 0, -p.size)
  ctx.fill()
  ctx.restore()
}

export function drawSnow(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.globalAlpha = p.opacity
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  ctx.fill()
}

export interface ParticleContext {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  leaves: Particle[]
  snow: Particle[]
  animationId: number
}

export function initParticles(canvas: HTMLCanvasElement): ParticleContext | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = w * Math.min(window.devicePixelRatio, 2)
  canvas.height = h * Math.min(window.devicePixelRatio, 2)
  ctx.scale(Math.min(window.devicePixelRatio, 2), Math.min(window.devicePixelRatio, 2))

  const isMobile = window.innerWidth <= 767
  const leafCount = isMobile ? 15 : 30
  const snowCount = isMobile ? 50 : 120

  const leaves = createLeafParticles(leafCount, w, h)
  const snow = createSnowParticles(snowCount, w, h)

  let animationId = 0

  function animate() {
    ctx!.clearRect(0, 0, w, h)

    for (const leaf of leaves) {
      updateParticle(leaf, w, h)
      drawLeaf(ctx!, leaf)
    }
    for (const flake of snow) {
      updateParticle(flake, w, h)
      drawSnow(ctx!, flake)
    }

    animationId = requestAnimationFrame(animate)
  }

  animationId = requestAnimationFrame(animate)

  return { canvas, ctx, leaves, snow, animationId }
}

export function destroyParticles(pctx: ParticleContext): void {
  cancelAnimationFrame(pctx.animationId)
}
