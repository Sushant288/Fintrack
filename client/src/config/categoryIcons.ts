import React from 'react';
import {
  Utensils,
  Home,
  Car,
  Zap,
  Film,
  HeartPulse,
  ShoppingBag,
  BookOpen,
  Plane,
  Repeat,
  MoreHorizontal,
  Briefcase,
  Laptop,
  Building,
  TrendingUp,
  Gift,
  DollarSign,
  Tag,
  Coffee,
  Smartphone,
  Shield,
  Music,
  Tv,
  Wifi,
  Wrench,
  CreditCard,
  Smile,
  Heart,
  LucideProps
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  // Required by server/src/services/category.defaults.ts
  utensils: Utensils,
  home: Home,
  car: Car,
  zap: Zap,
  film: Film,
  'heart-pulse': HeartPulse,
  'shopping-bag': ShoppingBag,
  'book-open': BookOpen,
  plane: Plane,
  repeat: Repeat,
  'more-horizontal': MoreHorizontal,
  briefcase: Briefcase,
  laptop: Laptop,
  building: Building,
  'trending-up': TrendingUp,
  gift: Gift,
  'dollar-sign': DollarSign,

  // Fallback and user options
  tag: Tag,
  coffee: Coffee,
  smartphone: Smartphone,
  shield: Shield,
  music: Music,
  tv: Tv,
  wifi: Wifi,
  wrench: Wrench,
  'credit-card': CreditCard,
  smile: Smile,
  heart: Heart
};

export const FALLBACK_CATEGORY_ICON = Tag;

export function getCategoryIcon(slug: string | null | undefined): React.ComponentType<LucideProps> {
  if (!slug) return FALLBACK_CATEGORY_ICON;
  return CATEGORY_ICONS[slug] || FALLBACK_CATEGORY_ICON;
}

export const CATEGORY_ICON_SLUGS = Object.keys(CATEGORY_ICONS);
