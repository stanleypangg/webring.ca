import { describe, expect, it } from 'vitest'
import { createLeafParticles, createSnowParticles, type Particle } from '../lib/splash/particles'

describe('particle creation', () => {
  it('creates the requested number of leaf particles', () => {
    const leaves = createLeafParticles(30, 1000, 800)
    expect(leaves).toHaveLength(30)
  })

  it('creates leaf particles within canvas bounds', () => {
    const leaves = createLeafParticles(20, 1000, 800)
    leaves.forEach((p: Particle) => {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1000)
      expect(p.size).toBeGreaterThan(0)
    })
  })

  it('creates the requested number of snow particles', () => {
    const snow = createSnowParticles(100, 1000, 800)
    expect(snow).toHaveLength(100)
  })

  it('creates snow particles smaller than leaves', () => {
    const leaves = createLeafParticles(50, 1000, 800)
    const snow = createSnowParticles(50, 1000, 800)
    const avgLeaf = leaves.reduce((s: number, p: Particle) => s + p.size, 0) / leaves.length
    const avgSnow = snow.reduce((s: number, p: Particle) => s + p.size, 0) / snow.length
    expect(avgSnow).toBeLessThan(avgLeaf)
  })
})
