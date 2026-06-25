export type PlayerAnimation = 'idle' | 'run' | 'jump' | 'roll' | 'crouch' | 'attack' | 'attack2' | 'attack3' | 'heavyAttack' | 'weaponArt' | 'weaponOn' | 'weaponOff' | 'hurt' | 'death'
export type PlayerModelId = 'knight-hero' | 'knight2' | 'pixel-knight' | 'sprite-hero' | 'black-knight' | 'demon-warrior'

type AnimationAssets = Record<PlayerAnimation, string>
type AnimationFrameCounts = Record<PlayerAnimation, number>
type AnimationDurations = Partial<Record<PlayerAnimation, number>>
type AnimationGroundOffsets = Partial<Record<PlayerAnimation, number>>
type AnimationSheetFrameCounts = Partial<Record<PlayerAnimation, number>>

export interface PlayerComboStep {
  animation: PlayerAnimation
  startFrame?: number
  frameCount?: number
  duration?: number
  damageScale?: number
}

export interface PlayerModel {
  id: PlayerModelId
  name: string
  code: string
  tagline: string
  description: string
  specialty: string
  accent: string
  frameWidth: number
  frameHeight: number
  renderWidth: number
  renderHeight: number
  assets: AnimationAssets
  frames: AnimationFrameCounts
  sheetFrames?: AnimationSheetFrameCounts
  durations?: AnimationDurations
  groundOffsets?: AnimationGroundOffsets
  comboAnimations?: PlayerAnimation[]
  comboSteps?: PlayerComboStep[]
}

export const DEFAULT_PLAYER_MODEL_ID: PlayerModelId = 'knight-hero'

export const PLAYER_MODELS: PlayerModel[] = [
  {
    id: 'knight-hero',
    name: '骑士英雄',
    code: 'FIELD-01',
    tagline: '近场核验',
    description: '使用 Knight Hero 动作组，移动、攻击、受击与死亡动作完整，适合作为默认实训执行模型。',
    specialty: '现场确认 / 快速处置',
    accent: '#efc566',
    frameWidth: 128,
    frameHeight: 96,
    renderWidth: 259,
    renderHeight: 194,
    assets: {
      idle: '/simulation/players/knight-hero/idle.png',
      run: '/simulation/players/knight-hero/run.png',
      jump: '/simulation/players/knight-hero/jump.png',
      roll: '/simulation/players/knight-hero/roll-dodge.png',
      crouch: '/simulation/players/knight-hero/crouch.png',
      attack: '/simulation/players/knight-hero/attack.png',
      attack2: '/simulation/players/knight-hero/heavy-attack.png',
      attack3: '/simulation/players/knight-hero/attack.png',
      heavyAttack: '/simulation/players/knight-hero/heavy-attack.png',
      weaponArt: '/simulation/players/knight-hero/heavy-attack.png',
      weaponOn: '/simulation/players/knight-hero/attack.png',
      weaponOff: '/simulation/players/knight-hero/idle.png',
      hurt: '/simulation/players/knight-hero/hurt.png',
      death: '/simulation/players/knight-hero/death.png',
    },
    frames: { idle: 5, run: 8, jump: 5, roll: 12, crouch: 4, attack: 11, attack2: 7, attack3: 11, heavyAttack: 7, weaponArt: 7, weaponOn: 11, weaponOff: 5, hurt: 3, death: 7 },
    durations: { idle: 760, run: 620, jump: 620, roll: 620, crouch: 520, attack: 460, attack2: 520, attack3: 480, heavyAttack: 560, weaponArt: 560, weaponOn: 420, weaponOff: 360, hurt: 260, death: 1550 },
    groundOffsets: { idle: 16, run: 16, jump: 16, roll: 0, crouch: 16, attack: 16, attack2: 16, attack3: 16, heavyAttack: 16, weaponArt: 16, weaponOn: 16, weaponOff: 16, hurt: 16, death: 16 },
    comboAnimations: ['attack', 'attack2', 'attack'],
  },
  {
    id: 'knight2',
    name: '圣辉骑士',
    code: 'FIELD-05',
    tagline: '连段突进',
    description: '使用 knight2 全套剑术动作，站立、行走、起步、三段斩击、刺击、重击和倒地动作均已接入。',
    specialty: '近战连段 / 快速突进',
    accent: '#d8f56a',
    frameWidth: 320,
    frameHeight: 128,
    renderWidth: 415,
    renderHeight: 166,
    assets: {
      idle: '/simulation/players/knight2/idle1.png',
      run: '/simulation/players/knight2/walk.png',
      jump: '/simulation/players/knight2/startwalking.png',
      roll: '/simulation/players/knight2/startwalking.png',
      crouch: '/simulation/players/knight2/idle2.png',
      attack: '/simulation/players/knight2/attack1.png',
      attack2: '/simulation/players/knight2/attack2.png',
      attack3: '/simulation/players/knight2/attack3.png',
      heavyAttack: '/simulation/players/knight2/whack.png',
      weaponArt: '/simulation/players/knight2/stab.png',
      weaponOn: '/simulation/players/knight2/startwalking.png',
      weaponOff: '/simulation/players/knight2/idle2.png',
      hurt: '/simulation/players/knight2/idle2.png',
      death: '/simulation/players/knight2/dead.png',
    },
    frames: { idle: 8, run: 10, jump: 2, roll: 2, crouch: 10, attack: 12, attack2: 17, attack3: 25, heavyAttack: 32, weaponArt: 17, weaponOn: 2, weaponOff: 10, hurt: 10, death: 21 },
    durations: { idle: 760, run: 640, jump: 360, roll: 360, crouch: 620, attack: 620, attack2: 780, attack3: 980, heavyAttack: 1180, weaponArt: 740, weaponOn: 320, weaponOff: 420, hurt: 280, death: 1600 },
    groundOffsets: { idle: 18, run: 18, jump: 18, roll: 18, crouch: 18, attack: 18, attack2: 18, attack3: 18, heavyAttack: 18, weaponArt: 18, weaponOn: 18, weaponOff: 18, hurt: 18, death: 18 },
    comboSteps: [
      { animation: 'attack', duration: 560, damageScale: 1 },
      { animation: 'attack2', duration: 650, damageScale: 1.12 },
      { animation: 'weaponArt', duration: 620, damageScale: 1.18 },
      { animation: 'attack3', duration: 820, damageScale: 1.28 },
      { animation: 'heavyAttack', duration: 980, damageScale: 1.38 },
    ],
  },
  {
    id: 'pixel-knight',
    name: '像素骑士',
    code: 'FIELD-06',
    tagline: '盾剑突击',
    description: '使用 Pixel Knight 图集切分动作，盾牌待机、移动、跳跃、格挡、斩击和倒地动作均已接入。',
    specialty: '盾牌防守 / 近战斩击',
    accent: '#f06f5a',
    frameWidth: 100,
    frameHeight: 100,
    renderWidth: 280,
    renderHeight: 280,
    assets: {
      idle: '/simulation/players/pixel-knight/idle.png',
      run: '/simulation/players/pixel-knight/run.png',
      jump: '/simulation/players/pixel-knight/jump.png',
      roll: '/simulation/players/pixel-knight/roll.png',
      crouch: '/simulation/players/pixel-knight/crouch.png',
      attack: '/simulation/players/pixel-knight/attack.png',
      attack2: '/simulation/players/pixel-knight/attack2.png',
      attack3: '/simulation/players/pixel-knight/attack3.png',
      heavyAttack: '/simulation/players/pixel-knight/heavy-attack.png',
      weaponArt: '/simulation/players/pixel-knight/weapon-art.png',
      weaponOn: '/simulation/players/pixel-knight/weapon-on.png',
      weaponOff: '/simulation/players/pixel-knight/weapon-off.png',
      hurt: '/simulation/players/pixel-knight/hurt.png',
      death: '/simulation/players/pixel-knight/death.png',
    },
    frames: { idle: 1, run: 6, jump: 2, roll: 2, crouch: 3, attack: 6, attack2: 5, attack3: 6, heavyAttack: 5, weaponArt: 6, weaponOn: 3, weaponOff: 1, hurt: 3, death: 6 },
    durations: { idle: 760, run: 640, jump: 360, roll: 360, crouch: 420, attack: 540, attack2: 560, attack3: 540, heavyAttack: 620, weaponArt: 540, weaponOn: 320, weaponOff: 320, hurt: 280, death: 1250 },
    groundOffsets: { idle: 27, run: 27, jump: 27, roll: 27, crouch: 27, attack: 27, attack2: 26, attack3: 27, heavyAttack: 26, weaponArt: 27, weaponOn: 27, weaponOff: 27, hurt: 27, death: 25 },
    comboSteps: [
      { animation: 'attack', duration: 540, damageScale: 1 },
      { animation: 'attack2', duration: 560, damageScale: 1.12 },
      { animation: 'weaponArt', duration: 540, damageScale: 1.18 },
      { animation: 'heavyAttack', duration: 620, damageScale: 1.3 },
    ],
  },
  {
    id: 'sprite-hero',
    name: '蓝刃剑士',
    code: 'TRACE-02',
    tagline: '证据追踪',
    description: '使用 Sprites 动作组，帧画幅更大，适合在选择页和实训场景中展示清晰的人物姿态。',
    specialty: '流程追踪 / 证据保全',
    accent: '#68d7c2',
    frameWidth: 200,
    frameHeight: 200,
    renderWidth: 310,
    renderHeight: 310,
    assets: {
      idle: '/simulation/players/sprite-hero/idle.png',
      run: '/simulation/players/sprite-hero/run.png',
      jump: '/simulation/players/sprite-hero/jump.png',
      roll: '/simulation/players/sprite-hero/roll-dodge.png',
      crouch: '/simulation/players/sprite-hero/crouch.png',
      attack: '/simulation/players/sprite-hero/attack.png',
      attack2: '/simulation/players/sprite-hero/heavy-attack.png',
      attack3: '/simulation/players/sprite-hero/attack.png',
      heavyAttack: '/simulation/players/sprite-hero/heavy-attack.png',
      weaponArt: '/simulation/players/sprite-hero/heavy-attack.png',
      weaponOn: '/simulation/players/sprite-hero/attack.png',
      weaponOff: '/simulation/players/sprite-hero/idle.png',
      hurt: '/simulation/players/sprite-hero/hurt.png',
      death: '/simulation/players/sprite-hero/death.png',
    },
    frames: { idle: 4, run: 8, jump: 2, roll: 12, crouch: 4, attack: 4, attack2: 4, attack3: 4, heavyAttack: 4, weaponArt: 4, weaponOn: 4, weaponOff: 4, hurt: 3, death: 7 },
    durations: { idle: 700, run: 580, jump: 620, roll: 640, crouch: 520, attack: 360, attack2: 430, attack3: 390, heavyAttack: 460, weaponArt: 460, weaponOn: 360, weaponOff: 360, hurt: 240, death: 1550 },
    groundOffsets: { idle: 72, run: 72, jump: 72, roll: 0, crouch: 72, attack: 72, attack2: 72, attack3: 72, heavyAttack: 72, weaponArt: 72, weaponOn: 72, weaponOff: 72, hurt: 72, death: 72 },
    comboAnimations: ['attack', 'attack2', 'attack'],
  },
  {
    id: 'black-knight',
    name: '黑甲骑士',
    code: 'RISK-03',
    tagline: '风险压制',
    description: '黑甲骑士模型已启用，适合风险压制与区域观察。',
    specialty: '风险识别 / 区域观察',
    accent: '#82b9ff',
    frameWidth: 128,
    frameHeight: 64,
    renderWidth: 360,
    renderHeight: 180,
    assets: {
      idle: '/simulation/players/black-knight/idle.png',
      run: '/simulation/players/black-knight/run.png',
      jump: '/simulation/players/black-knight/jump.png',
      roll: '/simulation/players/black-knight/roll.png',
      crouch: '/simulation/players/black-knight/crouch.png',
      attack: '/simulation/players/black-knight/attack.png',
      attack2: '/simulation/players/black-knight/heavy-attack.png',
      attack3: '/simulation/players/black-knight/weapon-art.png',
      heavyAttack: '/simulation/players/black-knight/heavy-attack.png',
      weaponArt: '/simulation/players/black-knight/weapon-art.png',
      weaponOn: '/simulation/players/black-knight/weapon-on.png',
      weaponOff: '/simulation/players/black-knight/weapon-off.png',
      hurt: '/simulation/players/black-knight/hurt.png',
      death: '/simulation/players/black-knight/death.png',
    },
    frames: { idle: 6, run: 12, jump: 6, roll: 12, crouch: 4, attack: 40, attack2: 40, attack3: 35, heavyAttack: 40, weaponArt: 35, weaponOn: 18, weaponOff: 14, hurt: 6, death: 8 },
    sheetFrames: { attack: 40, attack2: 40, attack3: 35, heavyAttack: 40, weaponArt: 35, weaponOn: 18, weaponOff: 14 },
    durations: { idle: 760, run: 620, jump: 620, roll: 430, crouch: 520, attack: 2100, attack2: 2080, attack3: 1800, heavyAttack: 2080, weaponArt: 1800, weaponOn: 640, weaponOff: 520, hurt: 300, death: 1650 },
    comboSteps: [
      { animation: 'attack', startFrame: 0, frameCount: 8, duration: 420, damageScale: 1 },
      { animation: 'attack', startFrame: 8, frameCount: 8, duration: 420, damageScale: 1.04 },
      { animation: 'attack', startFrame: 16, frameCount: 8, duration: 420, damageScale: 1.08 },
      { animation: 'attack', startFrame: 24, frameCount: 8, duration: 420, damageScale: 1.12 },
      { animation: 'attack', startFrame: 32, frameCount: 8, duration: 420, damageScale: 1.16 },
      { animation: 'attack2', startFrame: 0, frameCount: 13, duration: 680, damageScale: 1.18 },
      { animation: 'attack2', startFrame: 13, frameCount: 14, duration: 720, damageScale: 1.22 },
      { animation: 'attack2', startFrame: 27, frameCount: 13, duration: 680, damageScale: 1.26 },
      { animation: 'weaponArt', startFrame: 0, frameCount: 7, duration: 360, damageScale: 1.18 },
      { animation: 'weaponArt', startFrame: 7, frameCount: 7, duration: 360, damageScale: 1.22 },
      { animation: 'weaponArt', startFrame: 14, frameCount: 7, duration: 360, damageScale: 1.26 },
      { animation: 'weaponArt', startFrame: 21, frameCount: 7, duration: 360, damageScale: 1.3 },
      { animation: 'weaponArt', startFrame: 28, frameCount: 7, duration: 360, damageScale: 1.35 },
    ],
  },
  {
    id: 'demon-warrior',
    name: '恶魔武士',
    code: 'NIGHT-04',
    tagline: '暗影斩击',
    description: '恶魔武士动作组已启用，适合后三章高压场景中的近战处置。',
    specialty: '暗影突袭 / 连段压制',
    accent: '#b878ff',
    frameWidth: 240,
    frameHeight: 240,
    renderWidth: 240,
    renderHeight: 240,
    assets: {
      idle: '/simulation/players/demon-warrior/idle.png',
      run: '/simulation/players/demon-warrior/run.png',
      jump: '/simulation/players/demon-warrior/jump.png',
      roll: '/simulation/players/demon-warrior/roll.png',
      crouch: '/simulation/players/demon-warrior/crouch.png',
      attack: '/simulation/players/demon-warrior/attack.png',
      attack2: '/simulation/players/demon-warrior/heavy-attack.png',
      attack3: '/simulation/players/demon-warrior/attack.png',
      heavyAttack: '/simulation/players/demon-warrior/heavy-attack.png',
      weaponArt: '/simulation/players/demon-warrior/weapon-art.png',
      weaponOn: '/simulation/players/demon-warrior/weapon-on.png',
      weaponOff: '/simulation/players/demon-warrior/weapon-off.png',
      hurt: '/simulation/players/demon-warrior/hurt.png',
      death: '/simulation/players/demon-warrior/death.png',
    },
    frames: { idle: 9, run: 6, jump: 9, roll: 6, crouch: 9, attack: 12, attack2: 12, attack3: 12, heavyAttack: 12, weaponArt: 12, weaponOn: 12, weaponOff: 9, hurt: 5, death: 23 },
    durations: { idle: 820, run: 620, jump: 680, roll: 540, crouch: 620, attack: 700, attack2: 760, attack3: 700, heavyAttack: 780, weaponArt: 820, weaponOn: 700, weaponOff: 420, hurt: 300, death: 1700 },
    groundOffsets: { idle: 48, run: 48, jump: 48, roll: 48, crouch: 48, attack: 48, attack2: 48, attack3: 48, heavyAttack: 48, weaponArt: 48, weaponOn: 48, weaponOff: 48, hurt: 48, death: 48 },
    comboSteps: [
      { animation: 'attack', duration: 620, damageScale: 1 },
      { animation: 'attack2', duration: 700, damageScale: 1.15 },
      { animation: 'weaponArt', duration: 780, damageScale: 1.3 },
    ],
  },
]

export function playerComboSteps(model: PlayerModel): PlayerComboStep[] {
  if (model.comboSteps?.length) return model.comboSteps
  const animations = model.comboAnimations?.length ? model.comboAnimations : ['attack' as const]
  return animations.map(animation => ({ animation }))
}

export function playerAnimationStyle(
  model: PlayerModel,
  animation: PlayerAnimation,
  scale = 1,
  options: { startFrame?: number; frameCount?: number; duration?: number } = {},
) {
  const totalFrameCount = Math.max(1, model.frames[animation] ?? model.frames.idle)
  const sheetFrameCount = Math.max(totalFrameCount, model.sheetFrames?.[animation] ?? totalFrameCount)
  const requestedStartFrame = Math.max(0, Math.floor(options.startFrame ?? 0))
  const frameStart = Math.min(requestedStartFrame, Math.max(0, sheetFrameCount - 1))
  const maxPlayableFrames = Math.max(1, sheetFrameCount - frameStart)
  const frameCount = Math.max(1, Math.min(Math.floor(options.frameCount ?? totalFrameCount), maxPlayableFrames))
  const frameSteps = Math.max(1, frameCount - 1)
  const renderWidth = Math.round(model.renderWidth * scale)
  const renderHeight = Math.round(model.renderHeight * scale)
  const renderScale = renderHeight / model.frameHeight
  const frameTravel = frameCount > 1 ? -(renderWidth * (frameCount - 1)) : 0
  const frameStartOffset = -(renderWidth * frameStart)
  const groundOffset = Math.round((model.groundOffsets?.[animation] ?? 0) * renderScale)
  const duration = options.duration ?? model.durations?.[animation]
    ?? (animation === 'idle' ? 760 : animation === 'run' ? 620 : animation === 'jump' ? 620 : animation === 'roll' ? 430 : animation === 'crouch' ? 200 : animation === 'attack' || animation === 'attack2' || animation === 'attack3' || animation === 'weaponArt' ? 560 : animation === 'heavyAttack' ? 620 : animation === 'weaponOn' || animation === 'weaponOff' ? 520 : animation === 'hurt' ? 300 : 900)
  const iteration = animation === 'idle' || animation === 'run' || animation === 'crouch' ? 'infinite' : '1'

  return {
    sheet: model.assets[animation],
    frameWidth: renderWidth,
    frameHeight: renderHeight,
    sheetWidth: renderWidth * sheetFrameCount,
    frameStart: frameStartOffset,
    frameTravel,
    frameCount,
    frameSteps,
    groundOffset,
    accent: model.accent,
    duration,
    iteration,
  }
}

export function playerModelFitScale(model: PlayerModel, maxWidth: number, maxHeight: number, maxScale = 1) {
  const widthScale = maxWidth / Math.max(1, model.renderWidth)
  const heightScale = maxHeight / Math.max(1, model.renderHeight)
  return Math.min(maxScale, widthScale, heightScale)
}

export function playerModelById(modelId: string | null | undefined) {
  return PLAYER_MODELS.find(model => model.id === modelId) ?? PLAYER_MODELS[0]
}

export function isPlayerModelId(modelId: unknown): modelId is PlayerModelId {
  return typeof modelId === 'string' && PLAYER_MODELS.some(model => model.id === modelId)
}
