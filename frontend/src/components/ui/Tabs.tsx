import type { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Underline-style tab strip with optional leading icon and numeric badge.
 * Active tab gets a 2px ink-colored bottom border; inactive tabs are muted.
 * Used by the Sprint Detail page; usable for any tab strip in the app.
 */
export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <nav className={`flex gap-0 border-b border-rule ${className}`} role="tablist">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 inline-flex items-center gap-2 transition-colors ${
              isActive ? 'border-ink text-text' : 'border-transparent text-mute hover:text-text'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.badge === 'number' && t.badge > 0 && (
              <span className="bg-lilac-tint text-lilac text-[10px] px-1.5 rounded-full">{t.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
