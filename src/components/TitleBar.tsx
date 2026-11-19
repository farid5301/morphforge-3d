import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Download,
  FolderOpen,
  Maximize2,
  Minimize2,
  Minus,
  Sparkles,
  X,
} from 'lucide-react';

interface TitleBarProps {
  projectName: string;
  onImportMesh: () => void;
  onQuickExportSTL: () => void;
  isExporting: boolean;
  isWatertight: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  projectName,
  onImportMesh,
  onQuickExportSTL,
  isExporting,
  isWatertight,
}) => {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.morphforge?.isMaximized().then(setMaximized).catch(() => {});
    const unsub = window.morphforge?.onMaximizedChange?.(setMaximized);
    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <header className="app-drag relative z-40 flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#080B15]/90 px-3 backdrop-blur-xl">
      {/* Left: Brand Identity */}
      <div className="flex items-center gap-3">
        <motion.div
          whileHover={{ rotate: 180, scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="app-no-drag relative flex h-8 w-8 items-center justify-center rounded-xl kinetic-border p-[1.5px] shadow-[0_0_20px_rgba(0,240,255,0.35)]"
        >
          <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#090D1A]">
            <Box className="h-4 w-4 text-[#00F0FF]" />
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wider text-white">
            MORPH<span className="text-[#00F0FF]">FORGE</span>
            <span className="ml-1 rounded bg-[#FF3B8B]/20 px-1.5 py-0.5 font-mono-tech text-[10px] font-semibold text-[#FF3B8B]">
              3D
            </span>
          </span>
          <span className="hidden text-xs text-slate-500 sm:inline">|</span>
          <span className="hidden max-w-[200px] truncate font-mono-tech text-[11px] text-slate-400 sm:inline">
            {projectName}
          </span>
          {isWatertight && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="hidden items-center gap-1 rounded-full border border-[#B8FF2C]/35 bg-[#B8FF2C]/10 px-2 py-0.5 font-mono-tech text-[10px] font-semibold text-[#B8FF2C] md:flex"
            >
              <Sparkles className="h-2.5 w-2.5" />
              MANIFOLD OK
            </motion.span>
          )}
        </div>
      </div>

      {/* Right: Quick Actions + Window Controls */}
      <div className="app-no-drag flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={onImportMesh}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-[#00F0FF]/50 hover:bg-[#00F0FF]/10 hover:text-white cursor-pointer"
          title="Import existing .GLB, .OBJ, or .STL mesh into Print Prep Studio"
        >
          <FolderOpen className="h-3.5 w-3.5 text-[#00F0FF]" />
          <span>Import 3D</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={onQuickExportSTL}
          disabled={isExporting}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#38BDF8] px-3 py-1.5 text-xs font-bold text-[#070911] shadow-[0_0_20px_rgba(0,240,255,0.35)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isExporting ? 'Exporting...' : 'Quick STL'}</span>
        </motion.button>

        <div className="mx-1 h-4 w-[1px] bg-white/10" />

        <button
          onClick={() => window.morphforge?.minimize()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => window.morphforge?.maximize().then(setMaximized)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => window.morphforge?.close()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-500/80 hover:text-white cursor-pointer"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
