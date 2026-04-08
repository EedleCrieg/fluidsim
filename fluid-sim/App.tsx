
import React, { useState, useCallback, useEffect } from 'react';
import { InteractionMode, FluidConfig, Source, EdgeCondition } from './types';
import FluidCanvas from './components/FluidCanvas';
import Controls from './components/Controls';
import { Trash2, Play, Pause } from 'lucide-react';

const ThemeLegend: React.FC<{ theme: FluidConfig['colorTheme']; visible: boolean }> = ({ theme, visible }) => {
  const getLegendData = () => {
    switch (theme) {
      case 'multichrome':
        return null;
      case 'vorticity':
        return {
          gradient: 'linear-gradient(to top, #3b82f6, #0f172a, #ef4444)',
          topLabel: 'Anti-CW',
          bottomLabel: 'Clockwise',
          title: 'Vorticity'
        };
      case 'pressure':
        return {
          gradient: 'linear-gradient(to top, #d946ef, #0f172a, #22d3ee)',
          topLabel: 'High',
          bottomLabel: 'Low',
          title: 'Pressure'
        };
      case 'thermal':
        return {
          gradient: 'linear-gradient(to top, #1e1b4b, #ef4444, #fbbf24, #ffffff)',
          topLabel: 'Hot',
          bottomLabel: 'Cold',
          title: 'Thermal'
        };
      case 'kinetic':
        return {
          gradient: 'linear-gradient(to top, #1e1b4b, #4338ca, #d946ef, #fbbf24, #ffffff)',
          topLabel: 'Fast',
          bottomLabel: 'Slow',
          title: 'Kinetic'
        };
      case 'velocity':
        return null;
      case 'monochrome':
        return {
          gradient: 'linear-gradient(to top, #0f172a, #ffffff)',
          topLabel: 'Max',
          bottomLabel: 'Min',
          title: 'Density'
        };
      case 'strain':
        return {
          gradient: 'linear-gradient(to top, #0f172a, #facc15)',
          topLabel: 'High',
          bottomLabel: 'Low',
          title: 'Strain'
        };
      default:
        return null;
    }
  };

  const data = getLegendData();
  if (!data) return null;

  return (
    <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-30 pointer-events-auto transition-all duration-700 ease-in-out ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none'}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 [writing-mode:vertical-lr] rotate-180 mb-2">
        {data.title}
      </div>
      <div className="glass w-12 h-64 rounded-full p-3 flex flex-col items-center justify-between border border-white/5 relative shadow-2xl">
        <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter text-center pt-2">
          {data.topLabel}
        </span>
        <div 
          className="w-1.5 flex-1 mx-1 my-3 rounded-full shadow-inner border border-white/5" 
          style={{ background: data.gradient }}
        />
        <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter text-center pb-2">
          {data.bottomLabel}
        </span>
      </div>
    </div>
  );
};

const INITIAL_CONFIG: FluidConfig = {
  viscosity: 0.1,
  diffusion: 0.2,
  velocityDissipation: 0.2,
  iterations: 32,
  dt: 0.08, 
  gridSize: 128, 
  showVelocity: false,
  showFluid: true,
  showParticles: true,
  colorTheme: 'multichrome',
  vorticity: 1.0, 
  vorticityScale: 1.0,
  buoyancy: 0.5,
  turbulence: 1.0,
  edgeCondition: EdgeCondition.WALL,
  showIndicators: true,
  compressibility: 0.0,
  normalStrength: 1.5,
  emitterStrength: 1.0,
  emitterColor: '#ffffff',
  brushRadius: 0.0005
};

const App: React.FC = () => {
  const [mode, setMode] = useState<InteractionMode>(InteractionMode.PLACE_SOURCE);
  const [config, setConfig] = useState<FluidConfig>(INITIAL_CONFIG);
  const [isPaused, setIsPaused] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);
  const [resetToggle, setResetToggle] = useState(0);
  const [imageMask, setImageMask] = useState<File | null>(null);
  const [emitterImage, setEmitterImage] = useState<File | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Prevent scrolling or other space behaviors
        e.preventDefault();
        setShowUI(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getRandomVibrantHex = () => {
    const h = Math.random() * 360;
    const s = 85;
    const l = 60;
    
    const hDecimal = h / 360;
    const sDecimal = s / 100;
    const lDecimal = l / 100;
    
    let r, g, b;
    if (sDecimal === 0) {
      r = g = b = lDecimal;
    } else {
      const q = lDecimal < 0.5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
      const p = 2 * lDecimal - q;
      const hue2rgb = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      r = hue2rgb(hDecimal + 1/3);
      g = hue2rgb(hDecimal);
      b = hue2rgb(hDecimal - 1/3);
    }
    
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const addSource = useCallback((x: number, y: number, vx: number, vy: number, type: 'source' | 'sink' | 'radial-source' = 'source') => {
    const id = Math.random().toString(36).substring(7);
    const color = (type === 'source' || type === 'radial-source') ? getRandomVibrantHex() : '#06b6d4';
    
    const defaultRadius = 0.001;
    
    const newSource: Source = { 
      id, 
      type, 
      x, 
      y, 
      vx, 
      vy, 
      strength: 1.0, 
      radius: defaultRadius,
      color, 
      active: type !== 'source',
      enabled: true
    };
    setSources(prev => [...prev, newSource]);
    return id;
  }, []);

  const updateSource = useCallback((id: string, updates: Partial<Source>) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const clearAll = useCallback(() => {
    setSources([]); setImageMask(null); setEmitterImage(null); setResetToggle(prev => prev + 1);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden select-none">
      <FluidCanvas 
        mode={mode} 
        config={config} 
        sources={sources} 
        onAddSource={addSource} 
        onUpdateSource={updateSource} 
        isPaused={isPaused} 
        resetTrigger={resetToggle} 
        imageMask={imageMask}
        emitterImage={emitterImage}
      />
      
      <Controls 
        mode={mode} 
        setMode={setMode} 
        config={config} 
        setConfig={setConfig} 
        sources={sources} 
        onRemoveSource={(id) => setSources(prev => prev.filter(s => s.id !== id))} 
        onUpdateSource={updateSource} 
        onClearAll={clearAll} 
        onImageUpload={setImageMask} 
        onEmitterUpload={setEmitterImage}
        onAddSource={addSource}
        showUI={showUI}
      />

      <ThemeLegend theme={config.colorTheme} visible={showUI} />

      <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto transition-all duration-700 ease-in-out ${showUI ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0 pointer-events-none'}`}>
        <div className="glass p-1.5 rounded-full flex items-center gap-1.5 shadow-2xl border border-white/5">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Play" : "Pause"}
            className={`p-2.5 rounded-full transition-all flex items-center justify-center ${isPaused ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-slate-500/20 text-slate-400 hover:bg-slate-500/30'}`}
          >
            {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
          </button>
          
          <button 
            onClick={clearAll} 
            title="Reset All"
            className="p-2.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all border border-red-500/10 flex items-center justify-center"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
