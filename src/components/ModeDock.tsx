import React from 'react';
import { motion } from 'framer-motion';
import {
  Cpu,
  Disc,
  KeyRound,
  Lamp,
  Sparkles,
} from 'lucide-react';
import { GenerationMode } from '../types/studio';

interface ModeDockProps {
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void;
}

const MODES: Array<{
  id: GenerationMode;
  label: string;
  sub: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
}> = [
  {
    id: 'puff',
    label: 'Puff Figurine',
    sub: 'Chibi 3D',
    icon: Sparkles,
    accent: '#00F0FF',
  },
  {
    id: 'relief',
    label: 'Bas-Relief',
    sub: 'Coin / Plaque',
    icon: Disc,
    accent: '#FFB800',
  },
  {
    id: 'lithophane',
    label: 'Lithophane',
    sub: 'Backlit Lamp',
    icon: Lamp,
    accent: '#B8FF2C',
  },
  {
    id: 'standee',
    label: 'Standee',
    sub: 'Keychain / Cut',
    icon: KeyRound,
    accent: '#A855F7',
  },
  {
    id: 'ai360',
    label: 'AI 360°',
    sub: 'Full Statue',
    icon: Cpu,
    accent: '#FF3B8B',
  },
];

export const ModeDock: React.FC<ModeDockProps> = ({ mode, onChange }) => {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="pointer-events-auto studio-glass flex items-center gap-1 rounded-2xl p-1.5"
      >
        {MODES.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className="relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-left transition cursor-pointer"
            >
              {active && (
                <motion.div
                  layoutId="active-mode-pill"
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  className="absolute inset-0 rounded-xl border border-white/20"
                  style={{
                    background: `linear-gradient(135deg, ${item.accent}28, ${item.accent}10)`,
                    boxShadow: `0 0 24px ${item.accent}35`,
                  }}
                />
              )}
              <Icon
                className="relative z-10 h-4 w-4 transition-transform"
                style={{ color: active ? item.accent : '#94a3b8' }}
              />
              <div className="relative z-10 leading-tight">
                <div
                  className={`text-xs font-bold ${
                    active ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </div>
                <div className="font-mono-tech text-[9px] uppercase tracking-wider text-slate-400">
                  {item.sub}
                </div>
              </div>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
};
