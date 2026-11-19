import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu,
  ImagePlus,
  Layers,
  RefreshCw,
  Scissors,
  Sliders,
  Sparkles,
  Upload,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  AIProviderConfig,
  AIProviderId,
  GenerationMode,
  ImagePrepSettings,
  LithophaneSettings,
  PuffSettings,
  ReliefFrameShape,
  ReliefSettings,
  StandeeSettings,
} from '../types/studio';
import { SampleCharacter } from '../data/sampleImages';
import { ProcessedImageData } from '../engine/imageProcessor';

interface LeftPanelProps {
  mode: GenerationMode;
  samples: SampleCharacter[];
  activeSampleId: string | null;
  onSelectSample: (sample: SampleCharacter) => void;
  onUploadFile: (file: File) => void;
  processedImg: ProcessedImageData | null;
  imagePrep: ImagePrepSettings;
  onImagePrepChange: (patch: Partial<ImagePrepSettings>) => void;
  puff: PuffSettings;
  onPuffChange: (patch: Partial<PuffSettings>) => void;
  relief: ReliefSettings;
  onReliefChange: (patch: Partial<ReliefSettings>) => void;
  lithophane: LithophaneSettings;
  onLithophaneChange: (patch: Partial<LithophaneSettings>) => void;
  standee: StandeeSettings;
  onStandeeChange: (patch: Partial<StandeeSettings>) => void;
  aiConfig: AIProviderConfig;
  onAIConfigChange: (patch: Partial<AIProviderConfig>) => void;
  onTriggerAI360: () => void;
  aiBusy: boolean;
  aiProgress: { stage: string; progress: number } | null;
}

const SliderRow: React.FC<{
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  pink?: boolean;
  onChange: (v: number) => void;
}> = ({ label, valueLabel, min, max, step, value, pink, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-300">{label}</span>
      <span className="font-mono-tech font-semibold text-[#00F0FF]">{valueLabel}</span>
    </div>
    <input
      type="range"
      className={`studio-slider ${pink ? 'pink' : ''}`}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </div>
);

const ToggleChip: React.FC<{
  label: string;
  active: boolean;
  onToggle: () => void;
}> = ({ label, active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition cursor-pointer ${
      active
        ? 'border-[#00F0FF]/55 bg-[#00F0FF]/15 text-white'
        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
    }`}
  >
    <span>{label}</span>
    <span
      className={`h-2.5 w-2.5 rounded-full transition ${
        active ? 'bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]' : 'bg-slate-600'
      }`}
    />
  </button>
);

export const LeftPanel: React.FC<LeftPanelProps> = ({
  mode,
  samples,
  activeSampleId,
  onSelectSample,
  onUploadFile,
  processedImg,
  imagePrep,
  onImagePrepChange,
  puff,
  onPuffChange,
  relief,
  onReliefChange,
  lithophane,
  onLithophaneChange,
  standee,
  onStandeeChange,
  aiConfig,
  onAIConfigChange,
  onTriggerAI360,
  aiBusy,
  aiProgress,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewTab, setPreviewTab] = useState<'clean' | 'mask' | 'depth'>('clean');
  const [localStatus, setLocalStatus] = useState<{
    checked: boolean;
    online: boolean;
    info: string;
  }>({ checked: false, online: false, info: '' });

  const handleCheckLocal = async () => {
    if (!window.morphforge?.checkLocalAI) {
      setLocalStatus({
        checked: true,
        online: false,
        info: 'Desktop app bridge required',
      });
      return;
    }
    const res = await window.morphforge.checkLocalAI(aiConfig.localUrl);
    setLocalStatus({
      checked: true,
      online: res.online,
      info: res.online
        ? `${res.device} (${res.vramGb ?? '?'}GB)`
        : res.detail || 'Offline — run local-ai-bridge/server.py',
    });
  };

  const previewUrl =
    previewTab === 'clean'
      ? processedImg?.cleanDataUrl
      : previewTab === 'mask'
        ? processedImg?.maskDataUrl
        : processedImg?.depthDataUrl;

  return (
    <aside className="studio-glass z-20 flex h-full w-[312px] shrink-0 flex-col border-r border-white/10">
      <div className="flex-1 space-y-4 overflow-y-auto p-3.5 pb-6">
        {/* 1) 2D PHOTO / CHARACTER INPUT */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
              <ImagePlus className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span>2D Photo Studio</span>
            </div>
            <span className="font-mono-tech text-[10px] text-slate-400">
              DROP / CTRL+V
            </span>
          </div>

          {/* Live Image / Mask / Depth Preview Card */}
          <div className="relative overflow-hidden rounded-xl border border-white/15 bg-[#070A14]">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-2 py-1">
              <div className="flex gap-1">
                {(['clean', 'mask', 'depth'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPreviewTab(tab)}
                    className={`rounded-md px-2 py-0.5 font-mono-tech text-[10px] font-semibold uppercase transition cursor-pointer ${
                      previewTab === tab
                        ? 'bg-[#00F0FF]/20 text-[#00F0FF]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-[#00F0FF] hover:text-[#070911] cursor-pointer"
              >
                <Upload className="h-2.5 w-2.5" />
                <span>Load Photo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-40 w-full cursor-pointer items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(30,41,59,0.55)_1px,_transparent_1px)] [background-size:12px_12px] p-2"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Input Preview"
                  className="max-h-full max-w-full rounded-lg object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] transition group-hover:scale-[1.03]"
                />
              ) : (
                <div className="text-center text-xs text-slate-400">
                  Click or drop any 2D photo or character
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent pb-2 opacity-0 transition group-hover:opacity-100">
                <span className="rounded-full bg-[#00F0FF] px-2.5 py-0.5 text-[10px] font-bold text-[#070911]">
                  Replace 2D Photo
                </span>
              </div>
            </div>
          </div>

          {/* Instant Built-in Character Presets */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Quick Test Characters</span>
              <span className="text-[#B8FF2C]">1-Click Play</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {samples.map((s) => {
                const active = activeSampleId === s.id;
                return (
                  <motion.button
                    key={s.id}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelectSample(s)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition cursor-pointer ${
                      active
                        ? 'border-[#00F0FF] bg-[#00F0FF]/15 shadow-[0_0_12px_rgba(0,240,255,0.28)]'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                    }`}
                  >
                    <img
                      src={s.dataUrl}
                      alt={s.name}
                      className="h-10 w-10 rounded object-contain"
                    />
                    <span className="w-full truncate text-center text-[9px] font-semibold text-slate-200">
                      {s.name}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2) SMART BACKGROUND & DEPTH CLEANUP */}
        <section className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
            <Scissors className="h-3.5 w-3.5 text-[#B8FF2C]" />
            <span>Cutout & Depth Map</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ToggleChip
              label="Auto Cutout"
              active={imagePrep.removeBackground}
              onToggle={() =>
                onImagePrepChange({ removeBackground: !imagePrep.removeBackground })
              }
            />
            <ToggleChip
              label="Invert Depth"
              active={imagePrep.invertDepth}
              onToggle={() =>
                onImagePrepChange({ invertDepth: !imagePrep.invertDepth })
              }
            />
          </div>

          {imagePrep.removeBackground && (
            <SliderRow
              label="Background Tolerance"
              valueLabel={`${imagePrep.bgTolerance}`}
              min={8}
              max={75}
              step={1}
              value={imagePrep.bgTolerance}
              onChange={(v) => onImagePrepChange({ bgTolerance: v })}
            />
          )}

          <SliderRow
            label="Depth Contrast"
            valueLabel={`${imagePrep.contrast.toFixed(2)}x`}
            min={0.5}
            max={2.0}
            step={0.05}
            value={imagePrep.contrast}
            onChange={(v) => onImagePrepChange({ contrast: v })}
          />

          <SliderRow
            label="3D Dome Boost"
            valueLabel={`${Math.round(imagePrep.foregroundBoost * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={imagePrep.foregroundBoost}
            onChange={(v) => onImagePrepChange({ foregroundBoost: v })}
          />

          <SliderRow
            label="Surface Smoothness"
            valueLabel={`${imagePrep.detailBlur}px`}
            min={0}
            max={6}
            step={1}
            value={imagePrep.detailBlur}
            onChange={(v) => onImagePrepChange({ detailBlur: v })}
          />
        </section>

        {/* 3) MODE-SPECIFIC 3D SCULPTING CONTROLS */}
        <section className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
            <Sliders className="h-3.5 w-3.5 text-[#FF3B8B]" />
            <span>
              {mode === 'puff' && 'Puff Figurine Sculpt'}
              {mode === 'relief' && 'Bas-Relief & Coin Sculpt'}
              {mode === 'lithophane' && 'Lithophane Optics'}
              {mode === 'standee' && 'Standee & Keychain'}
              {mode === 'ai360' && 'AI 360° Full-Sculpt Engine'}
            </span>
          </div>

          {/* MODE: PUFF FIGURINE */}
          {mode === 'puff' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <ToggleChip
                  label="Double-Sided"
                  active={puff.doubleSided}
                  onToggle={() => onPuffChange({ doubleSided: !puff.doubleSided })}
                />
                <ToggleChip
                  label="Back Detail"
                  active={puff.mirrorBackDetail}
                  onToggle={() =>
                    onPuffChange({ mirrorBackDetail: !puff.mirrorBackDetail })
                  }
                />
              </div>
              <SliderRow
                label="Puff Volume Thickness"
                valueLabel={`${puff.puffDepthMm} mm`}
                min={6}
                max={42}
                step={1}
                value={puff.puffDepthMm}
                onChange={(v) => onPuffChange({ puffDepthMm: v })}
              />
              <SliderRow
                label="Chibi Roundness"
                valueLabel={`${Math.round((1 - puff.profileRoundness) * 100)}%`}
                min={0.35}
                max={0.85}
                step={0.02}
                value={puff.profileRoundness}
                onChange={(v) => onPuffChange({ profileRoundness: v })}
              />
              <SliderRow
                label="Face & Armor Relief"
                valueLabel={`${puff.detailReliefMm.toFixed(1)} mm`}
                min={0}
                max={6}
                step={0.2}
                value={puff.detailReliefMm}
                onChange={(v) => onPuffChange({ detailReliefMm: v })}
              />
              <SliderRow
                label="Silhouette Smooth"
                valueLabel={`${puff.contourSmoothPasses} passes`}
                min={0}
                max={12}
                step={1}
                value={puff.contourSmoothPasses}
                onChange={(v) => onPuffChange({ contourSmoothPasses: v })}
              />
              <SliderRow
                label="Mesh Detail Grid"
                valueLabel={`${puff.resolution}px`}
                min={96}
                max={220}
                step={8}
                value={puff.resolution}
                onChange={(v) => onPuffChange({ resolution: v })}
              />
            </div>
          )}

          {/* MODE: BAS-RELIEF */}
          {mode === 'relief' && (
            <div className="space-y-2.5">
              <div>
                <div className="mb-1 text-[11px] text-slate-300">Plaque / Coin Shape</div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ['circle', 'Coin'],
                      ['rounded', 'Rounded'],
                      ['hexagon', 'Hex'],
                      ['shield', 'Shield'],
                      ['rectangle', 'Rect'],
                    ] as Array<[ReliefFrameShape, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => onReliefChange({ frameShape: id })}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
                        relief.frameShape === id
                          ? 'border-[#FFB800] bg-[#FFB800]/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <SliderRow
                label="Relief Depth"
                valueLabel={`${relief.reliefDepthMm.toFixed(1)} mm`}
                min={2}
                max={18}
                step={0.5}
                value={relief.reliefDepthMm}
                onChange={(v) => onReliefChange({ reliefDepthMm: v })}
              />
              <SliderRow
                label="Backing Slab Thickness"
                valueLabel={`${relief.baseThicknessMm.toFixed(1)} mm`}
                min={2}
                max={12}
                step={0.5}
                value={relief.baseThicknessMm}
                onChange={(v) => onReliefChange({ baseThicknessMm: v })}
              />
              <SliderRow
                label="Raised Rim Height"
                valueLabel={`${relief.borderHeightMm.toFixed(1)} mm`}
                min={0}
                max={10}
                step={0.5}
                value={relief.borderHeightMm}
                onChange={(v) => onReliefChange({ borderHeightMm: v })}
              />
              <SliderRow
                label="Mesh Resolution"
                valueLabel={`${relief.resolution}px`}
                min={96}
                max={240}
                step={12}
                value={relief.resolution}
                onChange={(v) => onReliefChange({ resolution: v })}
              />
            </div>
          )}

          {/* MODE: LITHOPHANE */}
          {mode === 'lithophane' && (
            <div className="space-y-2.5">
              <ToggleChip
                label="Curved Lamp Arc (Self-Standing)"
                active={lithophane.curved}
                onToggle={() => onLithophaneChange({ curved: !lithophane.curved })}
              />
              {lithophane.curved && (
                <SliderRow
                  label="Arc Sweep Angle"
                  valueLabel={`${lithophane.curveAngleDeg}°`}
                  min={30}
                  max={180}
                  step={5}
                  value={lithophane.curveAngleDeg}
                  onChange={(v) => onLithophaneChange({ curveAngleDeg: v })}
                />
              )}
              <SliderRow
                label="Brightest Wall (Min)"
                valueLabel={`${lithophane.minThicknessMm.toFixed(1)} mm`}
                min={0.6}
                max={1.4}
                step={0.1}
                value={lithophane.minThicknessMm}
                onChange={(v) => onLithophaneChange({ minThicknessMm: v })}
              />
              <SliderRow
                label="Darkest Wall (Max)"
                valueLabel={`${lithophane.maxThicknessMm.toFixed(1)} mm`}
                min={2.2}
                max={4.6}
                step={0.1}
                value={lithophane.maxThicknessMm}
                onChange={(v) => onLithophaneChange({ maxThicknessMm: v })}
              />
              <SliderRow
                label="Outer Frame Width"
                valueLabel={`${lithophane.frameWidthMm.toFixed(1)} mm`}
                min={0}
                max={8}
                step={0.5}
                value={lithophane.frameWidthMm}
                onChange={(v) => onLithophaneChange({ frameWidthMm: v })}
              />
              <SliderRow
                label="Mesh Resolution"
                valueLabel={`${lithophane.resolution}px`}
                min={100}
                max={240}
                step={12}
                value={lithophane.resolution}
                onChange={(v) => onLithophaneChange({ resolution: v })}
              />
            </div>
          )}

          {/* MODE: STANDEE / KEYCHAIN */}
          {mode === 'standee' && (
            <div className="space-y-2.5">
              <ToggleChip
                label="Add Top Keychain Loop Hole"
                active={standee.keychainHole}
                onToggle={() =>
                  onStandeeChange({ keychainHole: !standee.keychainHole })
                }
              />
              {standee.keychainHole && (
                <SliderRow
                  label="Ring Hole Diameter"
                  valueLabel={`${standee.keychainHoleDiaMm.toFixed(1)} mm`}
                  min={3}
                  max={8}
                  step={0.5}
                  value={standee.keychainHoleDiaMm}
                  onChange={(v) => onStandeeChange({ keychainHoleDiaMm: v })}
                />
              )}
              <SliderRow
                label="Extrude Thickness"
                valueLabel={`${standee.thicknessMm.toFixed(1)} mm`}
                min={3}
                max={18}
                step={0.5}
                value={standee.thicknessMm}
                onChange={(v) => onStandeeChange({ thicknessMm: v })}
              />
              <SliderRow
                label="Edge Chamfer Bevel"
                valueLabel={`${standee.bevelMm.toFixed(1)} mm`}
                min={0}
                max={3}
                step={0.2}
                value={standee.bevelMm}
                onChange={(v) => onStandeeChange({ bevelMm: v })}
              />
              <SliderRow
                label="Surface Detail Emboss"
                valueLabel={`${standee.detailEmbossMm.toFixed(1)} mm`}
                min={0}
                max={3.5}
                step={0.2}
                value={standee.detailEmbossMm}
                onChange={(v) => onStandeeChange({ detailEmbossMm: v })}
              />
            </div>
          )}

          {/* MODE: AI 360° ENGINE */}
          {mode === 'ai360' && (
            <div className="space-y-2.5">
              <p className="text-[11px] leading-relaxed text-slate-400">
                Summon a full 360° AI character statue from your photo, then refine, add a base, check overhangs & export STL/3MF!
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  AI 3D Engine Provider
                </label>
                <select
                  value={aiConfig.provider}
                  onChange={(e) =>
                    onAIConfigChange({ provider: e.target.value as AIProviderId })
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-2 text-xs font-semibold text-white outline-none focus:border-[#FF3B8B]"
                >
                  <option value="hf-hunyuan3d">Hugging Face: Hunyuan3D-2 (Free)</option>
                  <option value="hf-trellis">Hugging Face: TRELLIS (Free)</option>
                  <option value="hf-triposr">Hugging Face: TripoSR (Fast Free)</option>
                  <option value="hf-custom">Hugging Face: Custom Space ID</option>
                  <option value="local-rtx">Local RTX GPU Bridge (Offline CUDA)</option>
                  <option value="tripo3d">Tripo3D Official API</option>
                  <option value="meshy">Meshy Official API</option>
                </select>
              </div>

              {aiConfig.provider.startsWith('hf-') && (
                <>
                  {aiConfig.provider === 'hf-custom' && (
                    <input
                      type="text"
                      placeholder="owner/space-name (e.g. tencent/Hunyuan3D-2)"
                      value={aiConfig.customSpaceId}
                      onChange={(e) =>
                        onAIConfigChange({ customSpaceId: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-1.5 font-mono-tech text-[11px] text-white outline-none focus:border-[#00F0FF]"
                    />
                  )}
                  <input
                    type="password"
                    placeholder="Optional HF Token (hf_... for priority ZeroGPU)"
                    value={aiConfig.hfToken}
                    onChange={(e) => onAIConfigChange({ hfToken: e.target.value })}
                    className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-1.5 font-mono-tech text-[11px] text-white outline-none focus:border-[#00F0FF]"
                  />
                </>
              )}

              {aiConfig.provider === 'meshy' && (
                <input
                  type="password"
                  placeholder="Meshy API Key (msy_...)"
                  value={aiConfig.meshyApiKey}
                  onChange={(e) => onAIConfigChange({ meshyApiKey: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-1.5 font-mono-tech text-[11px] text-white outline-none focus:border-[#FF3B8B]"
                />
              )}

              {aiConfig.provider === 'tripo3d' && (
                <input
                  type="password"
                  placeholder="Tripo3D API Key (tsk_...)"
                  value={aiConfig.tripoApiKey}
                  onChange={(e) => onAIConfigChange({ tripoApiKey: e.target.value })}
                  className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-1.5 font-mono-tech text-[11px] text-white outline-none focus:border-[#FF3B8B]"
                />
              )}

              {aiConfig.provider === 'local-rtx' && (
                <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={aiConfig.localUrl}
                      onChange={(e) => onAIConfigChange({ localUrl: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0A0E1C] px-2 py-1 font-mono-tech text-[11px] text-white outline-none"
                    />
                    <button
                      onClick={handleCheckLocal}
                      className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#00F0FF] hover:text-[#070911] cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Ping</span>
                    </button>
                  </div>
                  {localStatus.checked && (
                    <div
                      className={`flex items-center gap-1.5 text-[10px] ${
                        localStatus.online ? 'text-[#B8FF2C]' : 'text-amber-300'
                      }`}
                    >
                      {localStatus.online ? (
                        <Wifi className="h-3 w-3 shrink-0" />
                      ) : (
                        <WifiOff className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{localStatus.info}</span>
                    </div>
                  )}
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                disabled={aiBusy || !processedImg}
                onClick={onTriggerAI360}
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#FF3B8B] via-[#A855F7] to-[#00F0FF] px-4 py-2.5 text-xs font-bold text-white shadow-[0_0_24px_rgba(255,59,139,0.4)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {aiBusy ? (
                  <>
                    <Cpu className="h-4 w-4 animate-spin" />
                    <span>Sculpting 360° AI Mesh...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Summon Full 360° 3D Statue</span>
                  </>
                )}
              </motion.button>

              {aiProgress && aiBusy && (
                <div className="space-y-1">
                  <div className="flex justify-between font-mono-tech text-[10px] text-slate-300">
                    <span className="truncate">{aiProgress.stage}</span>
                    <span className="text-[#00F0FF]">{aiProgress.progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#FF3B8B] to-[#00F0FF]"
                      initial={{ width: 0 }}
                      animate={{ width: `${aiProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
