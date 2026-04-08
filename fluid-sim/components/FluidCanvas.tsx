
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { FluidSolver } from '../services/FluidSolver';
import { InteractionMode, Source, FluidConfig, EdgeCondition } from '../types';

interface FluidCanvasProps {
  mode: InteractionMode;
  config: FluidConfig;
  sources: Source[];
  onAddSource: (x: number, y: number, vx: number, vy: number, type: 'source' | 'sink' | 'radial-source') => string;
  onUpdateSource: (id: string, updates: Partial<Source>) => void;
  isPaused: boolean;
  resetTrigger?: number;
  imageMask?: File | null;
  emitterImage?: File | null;
}

const FluidCanvas: React.FC<FluidCanvasProps> = ({ 
  mode, 
  config, 
  sources, 
  onAddSource, 
  onUpdateSource,
  isPaused,
  resetTrigger,
  imageMask,
  emitterImage
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const solverRef = useRef<FluidSolver | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const sourcesRef = useRef<Source[]>(sources);
  const configRef = useRef<FluidConfig>(config);
  const isPausedRef = useRef<boolean>(isPaused);
  const modeRef = useRef<InteractionMode>(mode);
  const hasEmitterRef = useRef<boolean>(false);

  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  
  const isMouseDownRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const mouseRef = useRef({ x: 0, y: 0 });
  
  const [activePlacementId, setActivePlacementId] = useState<string | null>(null);
  const previewArrowRef = useRef<HTMLDivElement>(null);
  const smoothedAngleRef = useRef<number>(0);
  const placementRafRef = useRef<number | null>(null);

  const initSolver = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true });
    if (!gl) return;
    const NY = config.gridSize;
    const NX = Math.ceil((window.innerWidth / window.innerHeight) * NY);
    solverRef.current = new FluidSolver(gl, NX, NY, config.dt);
  }, [config.gridSize, config.dt]);

  useEffect(() => {
    initSolver();
    window.addEventListener('resize', initSolver);
    return () => window.removeEventListener('resize', initSolver);
  }, [initSolver]);

  useEffect(() => {
    if (solverRef.current && resetTrigger !== undefined && resetTrigger > 0) {
      solverRef.current.reset();
      hasEmitterRef.current = false;
    }
  }, [resetTrigger]);

  useEffect(() => {
    if (!activePlacementId) return;
    const src = sourcesRef.current.find(s => s.id === activePlacementId);
    if (!src) return;
    const updatePlacementVisuals = () => {
      if (!previewArrowRef.current) { placementRafRef.current = requestAnimationFrame(updatePlacementVisuals); return; }
      const dx = mouseRef.current.x - src.x;
      const dy = mouseRef.current.y - src.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        const targetAngle = Math.atan2(dy, dx);
        smoothedAngleRef.current = targetAngle;
      }
      previewArrowRef.current.style.transform = `rotate(${smoothedAngleRef.current}rad)`;
      placementRafRef.current = requestAnimationFrame(updatePlacementVisuals);
    };
    placementRafRef.current = requestAnimationFrame(updatePlacementVisuals);
    return () => { if (placementRafRef.current) cancelAnimationFrame(placementRafRef.current); };
  }, [activePlacementId]);

  useEffect(() => {
    if (imageMask && solverRef.current) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const nx = solverRef.current!.width;
          const ny = solverRef.current!.height;
          const offscreen = document.createElement('canvas');
          offscreen.width = nx; offscreen.height = ny;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, nx, ny);
          const imageData = ctx.getImageData(0, 0, nx, ny);
          const buffer = new Float32Array(nx * ny * 4);
          for (let i = 0; i < nx * ny; i++) {
            const isBlack = (imageData.data[i * 4] + imageData.data[i * 4 + 1] + imageData.data[i * 4 + 2]) / 3 < 128;
            const targetIdx = ((ny - 1 - Math.floor(i / nx)) * nx + (i % nx)) * 4;
            buffer[targetIdx] = isBlack ? 1.0 : 0.0; buffer[targetIdx + 3] = 1.0;
          }
          solverRef.current!.setObstaclesBatch(buffer);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(imageMask);
    }
  }, [imageMask]);

  useEffect(() => {
    if (emitterImage && solverRef.current) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const nx = solverRef.current!.width;
          const ny = solverRef.current!.height;
          const offscreen = document.createElement('canvas');
          offscreen.width = nx; offscreen.height = ny;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, nx, ny);
          const imageData = ctx.getImageData(0, 0, nx, ny);
          const buffer = new Float32Array(nx * ny * 4);
          for (let i = 0; i < nx * ny; i++) {
            const r = imageData.data[i * 4] / 255;
            const g = imageData.data[i * 4 + 1] / 255;
            const b = imageData.data[i * 4 + 2] / 255;
            const targetIdx = ((ny - 1 - Math.floor(i / nx)) * nx + (i % nx)) * 4;
            buffer[targetIdx] = r; buffer[targetIdx + 1] = g; buffer[targetIdx + 2] = b; buffer[targetIdx + 3] = 1.0;
          }
          solverRef.current!.setEmitterBatch(buffer);
          hasEmitterRef.current = true;
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(emitterImage);
    }
  }, [emitterImage]);

  const hexToRgb = (hex: string): number[] => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

  const render = useCallback(() => {
    if (!solverRef.current) return;
    if (!isPausedRef.current) {
      sourcesRef.current.forEach(src => {
        if (!src.active || !src.enabled) return;
        const nx = src.x / window.innerWidth, ny = 1.0 - (src.y / window.innerHeight), rgb = hexToRgb(src.color);
        if (src.type === 'source') {
          const baseDensity = 0.25 * src.strength;
          const baseVelocity = 2.0 * src.strength; 
          solverRef.current!.splat('density', nx, ny, [rgb[0] * baseDensity, rgb[1] * baseDensity, rgb[2] * baseDensity], src.radius, false, false, configRef.current.edgeCondition);
          solverRef.current!.splat('velocity', nx, ny, [src.vx * baseVelocity, -src.vy * baseVelocity, 0], src.radius, false, false, configRef.current.edgeCondition);
          solverRef.current!.splat('mass', nx, ny, [src.strength * 0.4, 0, 0], src.radius * 1.5, false, false, configRef.current.edgeCondition);
        } else if (src.type === 'radial-source') {
          solverRef.current!.splat('density', nx, ny, [rgb[0] * 0.1 * src.strength, rgb[1] * 0.1 * src.strength, rgb[2] * 0.1 * src.strength], src.radius, false, false, configRef.current.edgeCondition);
          solverRef.current!.splat('velocity', nx, ny, [0.75 * src.strength, 0, 0], src.radius, true, false, configRef.current.edgeCondition);
          solverRef.current!.splat('mass', nx, ny, [src.strength * 0.6, 0, 0], src.radius * 2.0, false, false, configRef.current.edgeCondition);
        } else if (src.type === 'sink') {
          solverRef.current!.splat('density', nx, ny, [0, 0, 0], src.radius * 1.5, false, true, configRef.current.edgeCondition);
          solverRef.current!.splat('velocity', nx, ny, [-1.5 * src.strength, 0, 0], src.radius * 1.2, true, false, configRef.current.edgeCondition);
          solverRef.current!.splat('mass', nx, ny, [-src.strength * 1.25, 0, 0], src.radius * 2.5, false, false, configRef.current.edgeCondition);
        }
      });
      if (isMouseDownRef.current && modeRef.current === InteractionMode.VIEW_ONLY) {
        const dx = mouseRef.current.x - lastMouseRef.current.x, dy = mouseRef.current.y - lastMouseRef.current.y;
        solverRef.current.splat('velocity', mouseRef.current.x / window.innerWidth, 1.0 - (mouseRef.current.y / window.innerHeight), [dx * 0.1, -dy * 0.1, 0], configRef.current.brushRadius, false, false, configRef.current.edgeCondition);
        solverRef.current.splat('density', mouseRef.current.x / window.innerWidth, 1.0 - (mouseRef.current.y / window.innerHeight), [0.8, 1.0, 1.2], configRef.current.brushRadius, false, false, configRef.current.edgeCondition);
      }
      const emitterRgb = hexToRgb(configRef.current.emitterColor);
      solverRef.current.step(
        configRef.current.viscosity, configRef.current.diffusion, configRef.current.velocityDissipation, configRef.current.vorticity, 
        configRef.current.buoyancy, configRef.current.edgeCondition, configRef.current.compressibility, hasEmitterRef.current, 
        emitterRgb, configRef.current.emitterStrength, configRef.current.vorticityScale
      );
    }
    solverRef.current.render(
      configRef.current.colorTheme, 
      configRef.current.normalStrength, 
      configRef.current.showVelocity, 
      configRef.current.showFluid, 
      configRef.current.showParticles
    );
    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => { rafRef.current = requestAnimationFrame(render); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }; }, [render]);

  const drawLine = (x0: number, y0: number, x1: number, y1: number, m: InteractionMode) => {
    if (!solverRef.current) return;
    const dist = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(dist / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(steps, 1), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      solverRef.current.setObstacle(x / window.innerWidth, 1.0 - (y / window.innerHeight), configRef.current.brushRadius, m === InteractionMode.ERASE);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; e.preventDefault(); e.stopPropagation();
    const x = e.clientX - rect.left, y = e.clientY - rect.top; lastMouseRef.current = { x, y }; mouseRef.current = { x, y }; isMouseDownRef.current = true;
    if (mode === InteractionMode.PLACE_SOURCE) {
      if (!activePlacementId) { setActivePlacementId(onAddSource(x, y, 1.0, 0, 'source')); smoothedAngleRef.current = 0; }
      else { onUpdateSource(activePlacementId, { vx: Math.cos(smoothedAngleRef.current), vy: Math.sin(smoothedAngleRef.current), active: true }); setActivePlacementId(null); }
    } else if (mode === InteractionMode.PLACE_RADIAL) onAddSource(x, y, 0, 0, 'radial-source');
    else if (mode === InteractionMode.PLACE_SINK) onAddSource(x, y, 0, 0, 'sink');
    else if (mode === InteractionMode.PLACE_PARTICLES && solverRef.current) {
      solverRef.current.addParticles(x / window.innerWidth, 1.0 - (y / window.innerHeight), config.brushRadius * 20.0, 2000);
    }
    else if ((mode === InteractionMode.DRAW_OBSTACLE || mode === InteractionMode.ERASE) && solverRef.current) {
      solverRef.current.setObstacle(x / window.innerWidth, 1.0 - (y / window.innerHeight), configRef.current.brushRadius, mode === InteractionMode.ERASE);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top; mouseRef.current = { x, y };
    if (isMouseDownRef.current && !activePlacementId) {
      if (mode === InteractionMode.DRAW_OBSTACLE || mode === InteractionMode.ERASE) drawLine(lastMouseRef.current.x, lastMouseRef.current.y, x, y, mode);
      if (mode === InteractionMode.PLACE_PARTICLES && solverRef.current) {
        solverRef.current.addParticles(x / window.innerWidth, 1.0 - (y / window.innerHeight), config.brushRadius * 20.0, 500);
      }
    }
    lastMouseRef.current = { x, y };
  };

  const placingSource = activePlacementId ? sources.find(s => s.id === activePlacementId) : null;

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden cursor-crosshair">
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => isMouseDownRef.current = false} onMouseLeave={() => isMouseDownRef.current = false} className="block w-full h-full" />
      {placingSource && (
        <div className="absolute pointer-events-none z-20" style={{ left: placingSource.x, top: placingSource.y }}>
          <div ref={previewArrowRef} className="absolute origin-left flex items-center h-1 w-[45px] top-[-2px] opacity-90"><div className="h-full bg-white w-full shadow-[0_0_12px_rgba(255,255,255,0.6)] rounded-full" /><div className="w-3.5 h-3.5 border-t-2 border-r-2 border-white rotate-45 -ml-3.5" /></div>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-white/40 bg-white/20 animate-pulse" style={{ backgroundColor: placingSource.color, boxShadow: `0 0 20px 5px ${placingSource.color}66` }} />
        </div>
      )}
      {config.showIndicators && sources.map(src => {
        if (src.id === activePlacementId) return null;
        const isSink = src.type === 'sink', isRadial = src.type === 'radial-source', angle = Math.atan2(src.vy, src.vx) * (180 / Math.PI), opacity = src.enabled ? 1.0 : 0.25;
        return (
          <div key={src.id} className="absolute pointer-events-none transition-opacity duration-300" style={{ left: src.x, top: src.y, zIndex: 10, opacity }}>
            {src.type === 'source' && (
              <div className="absolute origin-left flex items-center h-1" style={{ transform: `rotate(${angle}deg)`, width: Math.max(Math.sqrt(src.vx**2 + src.vy**2) * 45, 45), top: '-2px' }}>
                <div className="h-full bg-white w-full shadow-[0_0_12px_rgba(255,255,255,0.6)] rounded-full" /><div className="w-3.5 h-3.5 border-t-2 border-r-2 border-white rotate-45 -ml-3.5" />
              </div>
            )}
            <div className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-white/80 ${(isSink || isRadial) && src.enabled ? 'animate-pulse' : ''}`} style={{ backgroundColor: src.color, boxShadow: src.enabled ? `0 0 25px 5px ${src.color}dd` : 'none', scale: (isSink || isRadial) ? '1.2' : '1.0' }} />
            {isRadial && src.enabled && <div className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/20 animate-ping opacity-20" />}
          </div>
        );
      })}
    </div>
  );
};

export default FluidCanvas;
