import React from 'react';
import {
  Bike,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Languages,
  Moon,
  PenTool,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

interface HabitIconProps {
  name: string;
  className?: string;
}

export function HabitIcon({ name, className = 'w-4 h-4' }: HabitIconProps) {
  const sw = 1.75;
  switch (name) {
    case 'sun':
      return <Sun className={className} strokeWidth={sw} />;
    case 'moon':
      return <Moon className={className} strokeWidth={sw} />;
    case 'sparkles':
      return <Sparkles className={className} strokeWidth={sw} />;
    case 'droplets':
      return <Droplets className={className} strokeWidth={sw} />;
    case 'dumbbell':
      return <Dumbbell className={className} strokeWidth={sw} />;
    case 'heart-pulse':
      return <HeartPulse className={className} strokeWidth={sw} />;
    case 'footprints':
      return <Footprints className={className} strokeWidth={sw} />;
    case 'bike':
      return <Bike className={className} strokeWidth={sw} />;
    case 'book-open':
      return <BookOpen className={className} strokeWidth={sw} />;
    case 'languages':
      return <Languages className={className} strokeWidth={sw} />;
    case 'code':
      return <Code2 className={className} strokeWidth={sw} />;
    case 'target':
      return <Target className={className} strokeWidth={sw} />;
    case 'check-circle':
      return <CheckCircle2 className={className} strokeWidth={sw} />;
    case 'wallet':
      return <Wallet className={className} strokeWidth={sw} />;
    case 'trending-up':
      return <TrendingUp className={className} strokeWidth={sw} />;
    case 'flame':
      return <Flame className={className} strokeWidth={sw} />;
    case 'clock':
      return <Clock className={className} strokeWidth={sw} />;
    case 'pen-tool':
      return <PenTool className={className} strokeWidth={sw} />;
    default:
      return <Target className={className} strokeWidth={sw} />;
  }
}
