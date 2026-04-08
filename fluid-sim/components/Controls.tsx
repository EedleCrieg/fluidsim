
import React, { useRef, useState } from 'react';
import { InteractionMode, FluidConfig, Source, EdgeCondition } from '../types';
import { 
  Trash2, Wind, Square, Eraser, RefreshCw, 
  CircleDashed, Radio, Image as ImageIcon, Box, 
  Eye, EyeOff, Activity, 
  Layers, SprayCan, Zap,
  Settings,
  Navigation,
  Power,
  PowerOff,
  Sparkles,
  Droplets
} from 'lucide-react';

interface ControlsProps {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
  config: FluidConfig;
  setConfig: React.Dispatch<React.SetStateAction<FluidConfig>>;
  sources: Source[];
  onRemoveSource: (id: string) => void;
  onUpdateSource: (id: string, updates: Partial<Source>) => void;
  onClearAll: () => void;
  onImageUpload: (file: File) => void;
  onEmitterUpload: (file: File) => void;
  onAddSource: (x: number, y: number, vx: number, vy: number, type: 'source' | 'sink' | 'radial-source') => string;
  showUI?: boolean;
}

type Category = 'dynamics' | 'visual' | 'boundaries' | 'environment' | 'nodes';

const Controls: React.FC<ControlsProps> = ({
  mode,
  setMode,
  config,
  setConfig,
  sources,
  onRemoveSource,
  onUpdateSource,
  onClearAll,
  onImageUpload,
  onEmitterUpload,
  onAddSource,
  showUI = true
}) => {
  const wallInputRef = useRef<HTMLInputElement>(null);
  const emitterInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('dynamics');

  const placedSources = sources.filter(s => s.active || (s.type !== 'source'));

  const themeLabels: Record<string, string> = {
    multichrome: 'True Source Colors',
    kinetic: 'Kinetic (Density + Speed)',
    strain: 'Stress Pattern (Strain Rate)',
    thermal: 'Thermal (Heat Map)',
    velocity: 'Flow (Velocity Vectors)',
    vorticity: 'Vorticity (Turbulence)',
    pressure: 'Pressure (Potential)',
    monochrome: 'Monochrome (Density Only)'
  };

  return (
    <>
      <div className={`fixed top-3 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-auto z-50 transition-all duration-700 ease-in-out ${showUI ? 'translate-y-0 opacity-100' : '-translate-y-24 opacity-0'}`}>
        <div className="glass p-1.5 rounded-full flex items-center gap-1.5 pointer-events-auto shadow-2xl border border-white/10">
          <ToolButton active={mode === InteractionMode.PLACE_SOURCE} onClick={() => setMode(InteractionMode.PLACE_SOURCE)} icon={<Wind size={18} />} title="Directional" />
          <ToolButton active={mode === InteractionMode.PLACE_RADIAL} onClick={() => setMode(InteractionMode.PLACE_RADIAL)} icon={<Radio size={18} />} title="Radial" />
          <ToolButton active={mode === InteractionMode.PLACE_SINK} onClick={() => setMode(InteractionMode.PLACE_SINK)} icon={<CircleDashed size={18} />} title="Sink" />
          <ToolButton active={mode === InteractionMode.PLACE_PARTICLES} onClick={() => setMode(InteractionMode.PLACE_PARTICLES)} icon={<Sparkles size={18} />} title="Add Particles" />
          <ToolButton active={mode === InteractionMode.DRAW_OBSTACLE} onClick={() => setMode(InteractionMode.DRAW_OBSTACLE)} icon={<Square size={18} />} title="Wall" />
          <ToolButton active={mode === InteractionMode.ERASE} onClick={() => setMode(InteractionMode.ERASE)} icon={<Eraser size={18} />} title="Erase" />
          <div className="w-[1px] h-6 bg-white/10 mx-0.5" />
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${isSidebarOpen ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300'}`}><Settings size={18} /></button>
        </div>
      </div>

      <div className={`absolute left-3 top-3 bottom-3 w-72 flex flex-col gap-3 pointer-events-auto transition-all duration-700 ease-in-out ${showUI ? 'translate-x-0 opacity-100' : '-translate-x-96 opacity-0'}`}>
        {isSidebarOpen && (
          <div className="flex-1 flex flex-col gap-3 pointer-events-auto min-h-0">
            <div className="glass p-1.5 rounded-full flex items-center justify-between shadow-lg border border-white/5 flex-shrink-0">
              <TabButton active={activeCategory === 'dynamics'} onClick={() => setActiveCategory('dynamics')} icon={<Zap size={16} />} colorClass="text-amber-400" title="Dynamics" />
              <TabButton active={activeCategory === 'visual'} onClick={() => setActiveCategory('visual')} icon={<Layers size={16} />} colorClass="text-blue-400" title="Visuals" />
              <TabButton active={activeCategory === 'boundaries'} onClick={() => setActiveCategory('boundaries')} icon={<Box size={16} />} colorClass="text-indigo-400" title="Topology" />
              <TabButton active={activeCategory === 'environment'} onClick={() => setActiveCategory('environment')} icon={<SprayCan size={16} />} colorClass="text-emerald-400" title="Environment" />
              <TabButton active={activeCategory === 'nodes'} onClick={() => setActiveCategory('nodes')} icon={<RefreshCw size={16} />} colorClass="text-rose-400" title="Active Nodes" />
            </div>

            <div className="glass rounded-3xl p-5 shadow-xl border border-white/5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              {activeCategory === 'dynamics' && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2 border-b border-amber-400/20 pb-1">Fluid Dynamics</div>
                  <RangeControl label="Vorticity Strength" value={config.vorticity} min={0} max={2.0} step={0.01} onChange={(v) => setConfig({ ...config, vorticity: v })} />
                  <RangeControl label="Vorticity Scale" value={config.vorticityScale} min={0} max={20.0} step={0.5} onChange={(v) => setConfig({ ...config, vorticityScale: v })} />
                  <RangeControl label="Buoyancy" value={config.buoyancy} min={0} max={5.0} step={0.1} onChange={(v) => setConfig({ ...config, buoyancy: v })} />
                  <RangeControl label="Compressibility" value={config.compressibility} min={0} max={10.0} step={0.1} onChange={(v) => setConfig({ ...config, compressibility: v })} />
                  <RangeControl label="Velocity Decay" value={config.velocityDissipation} min={0} max={2.0} step={0.01} onChange={(v) => setConfig({ ...config, velocityDissipation: v })} />
                  <RangeControl label="Viscosity" value={config.viscosity} min={0} max={0.5} step={0.001} onChange={(v) => setConfig({ ...config, viscosity: v })} />
                  <RangeControl label="Diffusion" value={config.diffusion} min={0} max={0.5} step={0.001} onChange={(v) => setConfig({ ...config, diffusion: v })} />
                  <RangeControl label="Wall Thickness" value={config.brushRadius * 1000} min={0.1} max={1.0} step={0.01} onChange={(v) => setConfig({ ...config, brushRadius: v / 1000 })} />
                </div>
              )}

              {activeCategory === 'visual' && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2 border-b border-blue-400/20 pb-1">Engine & Palette</div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-slate-900/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <Droplets size={12} className={config.showFluid ? 'text-blue-400' : 'text-slate-600'} /> Show Fluid
                      </div>
                      <button onClick={() => setConfig({ ...config, showFluid: !config.showFluid })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${config.showFluid ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.showFluid ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <Sparkles size={12} className={config.showParticles ? 'text-emerald-400' : 'text-slate-600'} /> Show Particles
                      </div>
                      <button onClick={() => setConfig({ ...config, showParticles: !config.showParticles })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${config.showParticles ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.showParticles ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <Navigation size={12} className={config.showVelocity ? 'text-blue-400' : 'text-slate-600'} /> Flow Field Vectors
                      </div>
                      <button onClick={() => setConfig({ ...config, showVelocity: !config.showVelocity })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${config.showVelocity ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.showVelocity ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-900/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {config.showIndicators ? <Eye size={12} className="text-blue-400" /> : <EyeOff size={12} className="text-slate-600" />} Node Indicators
                      </div>
                      <button onClick={() => setConfig({ ...config, showIndicators: !config.showIndicators })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${config.showIndicators ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.showIndicators ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  <RangeControl label="Gooey Depth" value={config.normalStrength} min={0} max={10.0} step={0.1} onChange={(v) => setConfig({ ...config, normalStrength: v })} />
                  <RangeControl label="Resolution" value={config.gridSize} min={32} max={512} step={1} onChange={(v) => setConfig({ ...config, gridSize: v })} />
                  
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Theme Selection</div>
                    <div className="grid grid-cols-1 gap-1">
                      {(['multichrome', 'kinetic', 'strain', 'vorticity', 'pressure', 'thermal', 'velocity', 'monochrome'] as const).map(theme => (
                        <button key={theme} onClick={() => setConfig({ ...config, colorTheme: theme })} className={`text-[9px] py-2 px-3 rounded-lg border text-left uppercase font-bold transition-colors ${config.colorTheme === theme ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}>{themeLabels[theme]}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeCategory === 'boundaries' && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2 border-b border-indigo-400/20 pb-1">Simulation Topology</div>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { id: EdgeCondition.WALL, label: 'Solid Wall (Containment)' },
                      { id: EdgeCondition.PERIODIC, label: 'Wrapping Loop (Periodic)' },
                      { id: EdgeCondition.INFINITE, label: 'Infinite Outflow (Open)' }
                    ].map(edge => (
                      <button key={edge.id} onClick={() => setConfig({ ...config, edgeCondition: edge.id })} className={`text-[10px] py-3 px-3 rounded-xl border text-left font-bold transition-colors ${config.edgeCondition === edge.id ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}>{edge.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {activeCategory === 'environment' && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 border-b border-emerald-400/20 pb-1">Environment Scan</div>
                  <div className="space-y-3">
                    <input type="file" ref={wallInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onImageUpload(e.target.files[0])} />
                    <button onClick={() => wallInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"><ImageIcon size={14} /> Scan Wall Geometry</button>
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-blue-400"><Activity size={12} /> Flow Projector</div>
                         <input type="color" value={config.emitterColor} onChange={(e) => setConfig({...config, emitterColor: e.target.value})} className="w-5 h-5 rounded-md border border-white/10 bg-transparent cursor-pointer p-0" />
                       </div>
                       <RangeControl label="Intensity" value={config.emitterStrength} min={0} max={10.0} step={0.1} compact onChange={(v) => setConfig({...config, emitterStrength: v})} />
                       <input type="file" ref={emitterInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onEmitterUpload(e.target.files[0])} />
                       <button onClick={() => emitterInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">Project Image Flow</button>
                    </div>
                  </div>
                </div>
              )}

              {activeCategory === 'nodes' && (
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-2 border-b border-rose-400/20 pb-1">Active Nodes ({placedSources.length})</div>
                  <div className="space-y-2">
                    {placedSources.length === 0 ? (
                      <div className="text-center py-10 text-[9px] font-black uppercase tracking-widest text-slate-600">No active sources</div>
                    ) : (
                      placedSources.map(src => (
                        <div key={src.id} className={`bg-slate-900/50 p-3 rounded-xl border border-white/5 flex flex-col gap-2 shadow-inner transition-all duration-300 ${!src.enabled ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={src.color} onChange={(e) => onUpdateSource(src.id, { color: e.target.value })} className="w-4 h-4 rounded-full border border-white/20 bg-transparent cursor-pointer p-0" style={{ color: src.color }} />
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{src.type} {src.id.slice(0, 4)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => onUpdateSource(src.id, { enabled: !src.enabled })} className={`p-1 transition-colors ${src.enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-500'}`}>{src.enabled ? <Power size={12} /> : <PowerOff size={12} />}</button>
                              <button onClick={() => onRemoveSource(src.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={12} /></button>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <RangeControl label="Power" value={src.strength} min={0} max={src.type === 'sink' ? 1.0 : 10.0} step={0.01} compact onChange={(v) => onUpdateSource(src.id, { strength: v })} />
                            <RangeControl label="Radius" value={src.radius * 500} min={0.01} max={5} step={0.01} compact onChange={(v) => onUpdateSource(src.id, { radius: v / 500 })} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const TabButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, colorClass: string, title: string }> = ({ active, onClick, icon, colorClass, title }) => (
  <button onClick={onClick} title={title} className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${active ? `bg-white/10 border-white/10 ${colorClass} shadow-inner` : 'border-transparent text-slate-600 hover:text-slate-400 hover:bg-white/5'}`}>{icon}</button>
);

const ToolButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, title: string }> = ({ active, onClick, icon, title }) => (
  <button onClick={onClick} title={title} className={`flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${active ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300'}`}>{icon}</button>
);

const RangeControl: React.FC<{ label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, compact?: boolean }> = ({ label, value, min, max, step, onChange, compact }) => (
  <div className="flex flex-col gap-1.5 group">
    <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
      <span className="truncate pr-1">{label}</span>
      <span className="text-blue-400 shrink-0 tabular-nums">{value < 0.1 ? value.toFixed(4) : Math.round(value * 100) / 100}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors" />
  </div>
);

export default Controls;
