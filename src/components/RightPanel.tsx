import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Download,
  Droplets,
  Flame,
  Hammer,
  Layers,
  Maximize,
  Printer,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  BaseConfig,
  BaseStyle,
  MaterialPreset,
  MeshDiagnostics,
  PrinterPreset,
  PrintPrepSettings,
} from '../types/studio';
import { PRINTER_PRESETS } from '../data/printers';

interface RightPanelProps {
  printer: PrinterPreset;
  onPrinterChange: (p: PrinterPreset) => void;
  prep: PrintPrepSettings;
  onPrepChange: (patch: Partial<PrintPrepSettings>) => void;
  base: BaseConfig;
  onBaseChange: (patch: Partial<BaseConfig>) => void;
  diagnostics: MeshDiagnostics | null;
  materialPreset: MaterialPreset;
  onMaterialChange: (m: MaterialPreset) => void;
  onAutoFixAll: () => void;
  onResetTransform: () => void;
  onExport: (format: 'stl' | '3mf' | 'obj' | 'glb') => void;
  isExporting: boolean;
}

const SliderItem: React.FC<{
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
      <span
        className={`font-mono-tech font-semibold ${
          pink ? 'text-[#FF3B8B]' : 'text-[#00F0FF]'
        }`}
      >
        {valueLabel}
      </span>
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

const BASE_STYLES: Array<{ id: BaseStyle; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'round-plinth', label: 'Round Plinth' },
  { id: 'beveled-coin', label: 'Coin Disk' },
  { id: 'hex-tabletop', label: 'Hex Mini' },
  { id: 'square-museum', label: 'Museum Box' },
  { id: 'stepped-trophy', label: 'Trophy' },
];

export const RightPanel: React.FC<RightPanelProps> = ({
  printer,
  onPrinterChange,
  prep,
  onPrepChange,
  base,
  onBaseChange,
  diagnostics,
  materialPreset,
  onMaterialChange,
  onAutoFixAll,
  onResetTransform,
  onExport,
  isExporting,
}) => {
  const score = diagnostics?.printabilityScore ?? 100;
  const ringCircumference = 2 * Math.PI * 22;
  const ringOffset = ringCircumference * (1 - score / 100);
  const scoreColor =
    score >= 85 ? '#B8FF2C' : score >= 65 ? '#FFB800' : '#FF3B8B';

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <aside className="studio-glass z-20 flex h-full w-[332px] shrink-0 flex-col border-l border-white/10">
      <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 pb-6">
        {/* 1) PRINTABILITY SCORE & MANIFOLD HEALTH CARD */}
        <section className="rounded-xl border border-white/15 bg-gradient-to-br from-white/[0.05] to-transparent p-3">
          <div className="flex items-center gap-3">
            {/* Animated Circular Score Gauge */}
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52">
                <circle
                  cx="26"
                  cy="26"
                  r="22"
                  fill="none"
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth="4.5"
                />
                <motion.circle
                  cx="26"
                  cy="26"
                  r="22"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </svg>
              <span
                className="absolute font-mono-tech text-xs font-bold"
                style={{ color: scoreColor }}
              >
                {score}%
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Print Readiness
                </span>
                {diagnostics?.isWatertight ? (
                  <span className="flex items-center gap-1 rounded-full bg-[#B8FF2C]/15 px-2 py-0.5 font-mono-tech text-[9px] font-bold text-[#B8FF2C]">
                    <ShieldCheck className="h-3 w-3" /> WATERTIGHT
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 font-mono-tech text-[9px] font-bold text-rose-300">
                    <AlertTriangle className="h-3 w-3" /> NON-MANIFOLD
                  </span>
                )}
              </div>

              {/* Material / Time Estimates */}
              {diagnostics && (
                <div className="mt-1.5 grid grid-cols-3 gap-1 font-mono-tech text-[10px]">
                  <div className="rounded-md bg-black/35 px-1.5 py-1">
                    <div className="text-[9px] text-slate-400">
                      {printer.type === 'SLA' ? 'Resin' : 'PLA'}
                    </div>
                    <div className="font-bold text-white">
                      {printer.type === 'SLA'
                        ? `${diagnostics.resinMl.toFixed(1)}ml`
                        : `${diagnostics.filamentGrams.toFixed(1)}g`}
                    </div>
                  </div>
                  <div className="rounded-md bg-black/35 px-1.5 py-1">
                    <div className="text-[9px] text-slate-400">Overhang</div>
                    <div
                      className={`font-bold ${
                        diagnostics.overhangPercent > 18
                          ? 'text-[#FF3B8B]'
                          : 'text-[#00F0FF]'
                      }`}
                    >
                      {diagnostics.overhangPercent.toFixed(0)}%
                    </div>
                  </div>
                  <div className="rounded-md bg-black/35 px-1.5 py-1">
                    <div className="flex items-center gap-0.5 text-[9px] text-slate-400">
                      <Clock className="h-2.5 w-2.5" /> Est.
                    </div>
                    <div className="font-bold text-white">
                      {formatTime(diagnostics.estimatedMinutes)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Warnings + One-Click Auto-Fix */}
          {diagnostics && diagnostics.warnings.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {diagnostics.warnings.slice(0, 2).map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={onAutoFixAll}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#B8FF2C]/40 bg-[#B8FF2C]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#B8FF2C] transition hover:bg-[#B8FF2C]/25 cursor-pointer"
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Auto-Repair</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() =>
                onMaterialChange(
                  materialPreset === 'overhang-heatmap'
                    ? 'silk-pla'
                    : 'overhang-heatmap'
                )
              }
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                materialPreset === 'overhang-heatmap'
                  ? 'border-[#FF3B8B] bg-[#FF3B8B] text-white'
                  : 'border-[#FF3B8B]/40 bg-[#FF3B8B]/15 text-[#FF3B8B] hover:bg-[#FF3B8B]/25'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>Overhang Map</span>
            </motion.button>
          </div>
        </section>

        {/* 2) TARGET 3D PRINTER PRESET (FDM & SLA) */}
        <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
              <Printer className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span>Target 3D Printer</span>
            </div>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono-tech text-[10px] font-bold ${
                printer.type === 'SLA'
                  ? 'bg-[#FF3B8B]/20 text-[#FF3B8B]'
                  : 'bg-[#00F0FF]/20 text-[#00F0FF]'
              }`}
            >
              {printer.type === 'SLA' ? 'SLA RESIN' : 'FDM FILAMENT'}
            </span>
          </div>

          <select
            value={printer.id}
            onChange={(e) => {
              const found = PRINTER_PRESETS.find((p) => p.id === e.target.value);
              if (found) onPrinterChange(found);
            }}
            className="w-full rounded-lg border border-white/15 bg-[#0A0E1C] px-2.5 py-2 text-xs font-semibold text-white outline-none focus:border-[#00F0FF]"
          >
            <optgroup label="FDM Filament Printers">
              {PRINTER_PRESETS.filter((p) => p.type === 'FDM').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.name} ({p.bedWidthMm}×{p.bedDepthMm}×{p.bedHeightMm}mm)
                </option>
              ))}
            </optgroup>
            <optgroup label="SLA / MSLA Resin Printers">
              {PRINTER_PRESETS.filter((p) => p.type === 'SLA').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.name} ({p.bedWidthMm}×{p.bedDepthMm}×{p.bedHeightMm}mm)
                </option>
              ))}
            </optgroup>
          </select>
        </section>

        {/* 3) SCALE, ORIENTATION & AUTO-TILT */}
        <section className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
              <Maximize className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span>Scale & Orientation</span>
            </div>
            <button
              onClick={onResetTransform}
              className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Reset
            </button>
          </div>

          <SliderItem
            label="Real-World Height"
            valueLabel={`${prep.targetHeightMm} mm`}
            min={25}
            max={200}
            step={1}
            value={prep.targetHeightMm}
            onChange={(v) => onPrepChange({ targetHeightMm: v })}
          />

          {/* Quick Height Presets (Tabletop Mini, Desk Figurine, Big Statue) */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: '32mm Mini', h: 32 },
              { label: '75mm Chibi', h: 75 },
              { label: '110mm Desk', h: 110 },
              { label: '160mm Hero', h: 160 },
            ].map((preset) => (
              <button
                key={preset.h}
                onClick={() => onPrepChange({ targetHeightMm: preset.h })}
                className={`rounded-md border py-1 font-mono-tech text-[9px] font-semibold transition cursor-pointer ${
                  prep.targetHeightMm === preset.h
                    ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SliderItem
              label="Tilt X (Pitch)"
              valueLabel={`${prep.rotationXDeg}°`}
              min={-90}
              max={90}
              step={5}
              value={prep.rotationXDeg}
              onChange={(v) => onPrepChange({ rotationXDeg: v })}
            />
            <SliderItem
              label="Rotate Y (Yaw)"
              valueLabel={`${prep.rotationYDeg}°`}
              min={-180}
              max={180}
              step={5}
              value={prep.rotationYDeg}
              onChange={(v) => onPrepChange({ rotationYDeg: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onPrepChange({ rotationXDeg: 0, rotationZDeg: 0 })}
              className="rounded-lg border border-white/10 bg-white/5 py-1 text-[10px] font-semibold text-slate-200 hover:border-[#00F0FF]/50 hover:text-white cursor-pointer"
            >
              Stand Upright (0°)
            </button>
            <button
              onClick={() => onPrepChange({ rotationXDeg: -30, rotationZDeg: 0 })}
              className="rounded-lg border border-[#FF3B8B]/30 bg-[#FF3B8B]/10 py-1 text-[10px] font-semibold text-[#FF3B8B] hover:bg-[#FF3B8B]/20 cursor-pointer"
            >
              Resin Back-Tilt (-30°)
            </button>
          </div>
        </section>

        {/* 4) DISPLAY BASE / PEDESTAL GENERATOR */}
        <section className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
            <Layers className="h-3.5 w-3.5 text-[#FFB800]" />
            <span>Figurine Pedestal Base</span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {BASE_STYLES.map((b) => (
              <button
                key={b.id}
                onClick={() => onBaseChange({ style: b.id })}
                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
                  base.style === b.id
                    ? 'border-[#FFB800] bg-[#FFB800]/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {base.style !== 'none' && (
            <div className="space-y-2 pt-1">
              <SliderItem
                label="Base Width Ratio"
                valueLabel={`${Math.round(base.diameterScale * 100)}%`}
                min={0.75}
                max={1.7}
                step={0.05}
                value={base.diameterScale}
                onChange={(v) => onBaseChange({ diameterScale: v })}
              />
              <SliderItem
                label="Pedestal Height"
                valueLabel={`${base.heightMm.toFixed(1)} mm`}
                min={3}
                max={16}
                step={0.5}
                value={base.heightMm}
                onChange={(v) => onBaseChange({ heightMm: v })}
              />
              <SliderItem
                label="Foot Embed Depth"
                valueLabel={`${base.sinkMm.toFixed(1)} mm`}
                min={0.5}
                max={5}
                step={0.5}
                value={base.sinkMm}
                onChange={(v) => onBaseChange({ sinkMm: v })}
              />
            </div>
          )}
        </section>

        {/* 5) PRINT PREP: FLATTEN BOTTOM, SMOOTHING, RESIN HOLLOWING */}
        <section className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
            <Hammer className="h-3.5 w-3.5 text-[#B8FF2C]" />
            <span>Print Prep & Hollowing</span>
          </div>

          <SliderItem
            label="Flatten Bottom (Plane Cut)"
            valueLabel={
              prep.flattenBottomMm > 0 ? `${prep.flattenBottomMm.toFixed(1)} mm` : 'Off'
            }
            min={0}
            max={12}
            step={0.5}
            value={prep.flattenBottomMm}
            onChange={(v) => onPrepChange({ flattenBottomMm: v })}
          />

          <SliderItem
            label="Taubin Mesh Smooth"
            valueLabel={prep.smoothIterations > 0 ? `${prep.smoothIterations}x` : 'Off'}
            min={0}
            max={10}
            step={1}
            value={prep.smoothIterations}
            onChange={(v) => onPrepChange({ smoothIterations: v })}
          />

          <SliderItem
            label="Overhang Warning Angle"
            valueLabel={`${prep.overhangAngleDeg}°`}
            min={30}
            max={70}
            step={1}
            value={prep.overhangAngleDeg}
            pink
            onChange={(v) => onPrepChange({ overhangAngleDeg: v })}
          />

          {/* Resin Hollowing & Drain Holes */}
          <div className="rounded-lg border border-white/10 bg-black/25 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                <Droplets className="h-3.5 w-3.5 text-[#FF3B8B]" />
                <span>Hollow + Drain Holes (SLA)</span>
              </div>
              <button
                onClick={() => {
                  const next = !prep.hollowEnabled;
                  onPrepChange({ hollowEnabled: next });
                  if (next) onMaterialChange('xray-hollow');
                }}
                className={`rounded-full px-2.5 py-0.5 font-mono-tech text-[10px] font-bold transition cursor-pointer ${
                  prep.hollowEnabled
                    ? 'bg-[#FF3B8B] text-white shadow-[0_0_12px_rgba(255,59,139,0.5)]'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {prep.hollowEnabled ? 'ACTIVE' : 'OFF'}
              </button>
            </div>

            {prep.hollowEnabled && (
              <div className="space-y-2 pt-1">
                <SliderItem
                  label="Shell Wall Thickness"
                  valueLabel={`${prep.hollowWallMm.toFixed(1)} mm`}
                  min={1.5}
                  max={4.5}
                  step={0.1}
                  value={prep.hollowWallMm}
                  pink
                  onChange={(v) => onPrepChange({ hollowWallMm: v })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <SliderItem
                    label="Drain Holes"
                    valueLabel={`${prep.drainHoleCount}`}
                    min={0}
                    max={4}
                    step={1}
                    value={prep.drainHoleCount}
                    pink
                    onChange={(v) => onPrepChange({ drainHoleCount: v })}
                  />
                  <SliderItem
                    label="Hole Dia."
                    valueLabel={`${prep.drainHoleDiaMm.toFixed(1)}mm`}
                    min={2.5}
                    max={8}
                    step={0.5}
                    value={prep.drainHoleDiaMm}
                    pink
                    onChange={(v) => onPrepChange({ drainHoleDiaMm: v })}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 6) SLICER-READY MULTI-FORMAT EXPORT DECK */}
        <section className="space-y-2 rounded-xl border border-[#00F0FF]/30 bg-gradient-to-b from-[#00F0FF]/10 to-transparent p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
              <Download className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span>Export for 3D Printer</span>
            </div>
            <span className="font-mono-tech text-[9px] text-[#B8FF2C]">
              Z-UP · MILLIMETERS
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              disabled={isExporting}
              onClick={() => onExport('stl')}
              className="flex flex-col items-start rounded-xl bg-gradient-to-br from-[#00F0FF] to-[#0EA5E9] p-2.5 text-left text-[#070911] shadow-[0_0_20px_rgba(0,240,255,0.3)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-black tracking-tight">.STL</span>
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold opacity-80">
                Universal Binary
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              disabled={isExporting}
              onClick={() => onExport('3mf')}
              className="flex flex-col items-start rounded-xl bg-gradient-to-br from-[#B8FF2C] to-[#22C55E] p-2.5 text-left text-[#070911] shadow-[0_0_20px_rgba(184,255,44,0.25)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-black tracking-tight">.3MF</span>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold opacity-80">
                Bambu / Prusa / Orca
              </span>
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={isExporting}
              onClick={() => onExport('obj')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-white/35 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <Box className="h-3.5 w-3.5 text-amber-300" />
              <span>Export .OBJ</span>
            </button>
            <button
              disabled={isExporting}
              onClick={() => onExport('glb')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-white/35 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <Box className="h-3.5 w-3.5 text-purple-300" />
              <span>Export .GLB</span>
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
};
