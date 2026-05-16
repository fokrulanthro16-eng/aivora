'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

type NeuralRingProps = {
  size: number;
  color: string;
  thickness?: number;
  speed?: number;
  reverse?: boolean;
  pulse?: boolean;
  className?: string;
};

export function NeuralRing({
  size,
  color,
  thickness = 1.5,
  speed = 8,
  reverse = false,
  pulse = false,
  className,
}: NeuralRingProps) {
  const circumference = Math.PI * size;
  const dashArray = `${circumference * 0.6} ${circumference * 0.4}`;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('absolute', className)}
      animate={{
        rotate: reverse ? -360 : 360,
        ...(pulse ? { opacity: [0.6, 1, 0.6] } : {}),
      }}
      transition={{
        rotate: { duration: speed, repeat: Infinity, ease: 'linear' },
        ...(pulse ? { opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' } } : {}),
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={(size - thickness * 2) / 2}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
    </motion.svg>
  );
}
