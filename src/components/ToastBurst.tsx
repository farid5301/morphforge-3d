import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Sparkles, AlertTriangle, Info } from 'lucide-react';
import { StudioToast } from '../types/studio';

interface ToastBurstProps {
  toasts: StudioToast[];
  onDismiss: (id: string) => void;
}

const TONE_MAP = {
  cyan: {
    border: 'border-[#00F0FF]/45',
    bg: 'from-[#00F0FF]/18 to-[#0B1224]/95',
    text: 'text-[#00F0FF]',
    Icon: Info,
  },
  lime: {
    border: 'border-[#B8FF2C]/50',
    bg: 'from-[#B8FF2C]/20 to-[#0B1224]/95',
    text: 'text-[#B8FF2C]',
    Icon: CheckCircle2,
  },
  pink: {
    border: 'border-[#FF3B8B]/50',
    bg: 'from-[#FF3B8B]/20 to-[#0B1224]/95',
    text: 'text-[#FF3B8B]',
    Icon: Sparkles,
  },
  amber: {
    border: 'border-[#FFB800]/50',
    bg: 'from-[#FFB800]/20 to-[#0B1224]/95',
    text: 'text-[#FFB800]',
    Icon: AlertTriangle,
  },
};

const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i * Math.PI * 2) / 14,
  dist: 38 + (i % 3) * 18,
  color: ['#00F0FF', '#FF3B8B', '#B8FF2C', '#FFB800'][i % 4],
}));

export const ToastBurst: React.FC<ToastBurstProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="pointer-events-none fixed right-5 top-16 z-50 flex w-80 flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => {
          const style = TONE_MAP[t.tone];
          const Icon = style.Icon;
          return (
            <motion.div
              key={t.id}
              initial={{ x: 64, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 64, opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={() => onDismiss(t.id)}
              className={`pointer-events-auto relative cursor-pointer overflow-visible rounded-xl border ${style.border} bg-gradient-to-r ${style.bg} p-3 shadow-2xl backdrop-blur-xl`}
            >
              {t.celebrate && (
                <div className="pointer-events-none absolute left-6 top-1/2">
                  {SPARKS.map((s, idx) => (
                    <motion.span
                      key={idx}
                      initial={{ x: 0, y: 0, scale: 1.2, opacity: 1 }}
                      animate={{
                        x: Math.cos(s.angle) * s.dist,
                        y: Math.sin(s.angle) * s.dist,
                        scale: 0,
                        opacity: 0,
                      }}
                      transition={{ duration: 0.75, ease: 'easeOut' }}
                      className="absolute h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">{t.title}</div>
                  <div className="mt-0.5 break-words text-[11px] leading-snug text-slate-300">
                    {t.message}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
