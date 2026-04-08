
export enum InteractionMode {
  DRAW_OBSTACLE = 'DRAW_OBSTACLE',
  PLACE_SOURCE = 'PLACE_SOURCE',
  PLACE_RADIAL = 'PLACE_RADIAL',
  PLACE_SINK = 'PLACE_SINK',
  PLACE_PARTICLES = 'PLACE_PARTICLES',
  ERASE = 'ERASE',
  VIEW_ONLY = 'VIEW_ONLY'
}

export enum EdgeCondition {
  WALL = 'WALL',
  PERIODIC = 'PERIODIC',
  INFINITE = 'INFINITE'
}

export interface Source {
  id: string;
  type: 'source' | 'sink' | 'radial-source';
  x: number;
  y: number;
  vx: number;
  vy: number;
  strength: number;
  radius: number;
  color: string;
  active: boolean; // used for placement state
  enabled: boolean; // used for pausing/unpausing
}

export interface FluidConfig {
  viscosity: number;
  diffusion: number;
  velocityDissipation: number;
  iterations: number;
  dt: number;
  gridSize: number;
  showVelocity: boolean;
  showFluid: boolean;
  showParticles: boolean;
  colorTheme: 'kinetic' | 'monochrome' | 'velocity' | 'thermal' | 'vorticity' | 'pressure' | 'strain' | 'multichrome';
  vorticity: number;
  vorticityScale: number;
  buoyancy: number;
  turbulence: number;
  edgeCondition: EdgeCondition;
  showIndicators: boolean;
  compressibility: number;
  normalStrength: number;
  emitterStrength: number;
  emitterColor: string;
  brushRadius: number;
}
