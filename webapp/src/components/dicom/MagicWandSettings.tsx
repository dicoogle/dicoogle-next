import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sliders } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MagicWandSettingsProps {
  tolerance: number;
  onToleranceChange: (value: number) => void;
}

export function MagicWandSettings({ tolerance, onToleranceChange }: MagicWandSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const path = (event.composedPath?.() ?? []) as EventTarget[];
      const isWithin = (el: HTMLElement | null) =>
        !!el && (el.contains(target) || path.includes(el));

      if (isWithin(containerRef.current)) return;
      if (isWithin(popoverRef.current)) return;

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const popoverStyle = useMemo(() => {
    if (!anchorRect) return undefined;
    return {
      position: 'fixed' as const,
      top: anchorRect.bottom + 8,
      left: Math.max(8, anchorRect.right - 250),
      width: 250,
      zIndex: 1000,
    };
  }, [anchorRect]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          const rect = containerRef.current?.getBoundingClientRect() ?? null;
          setAnchorRect(rect);
          setIsOpen((open) => !open);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
        title="Magic Wand Settings"
      >
        <Sliders className="w-4 h-4" />
      </Button>

      {isOpen &&
        popoverStyle &&
        createPortal(
          <div
            className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-4"
            style={popoverStyle}
            ref={popoverRef}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Magic Wand Settings"
          >
            <div className="text-sm font-medium text-neutral-200 mb-3">
              Magic Wand Tolerance
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={tolerance}
                  onChange={(e) => onToleranceChange(Number(e.target.value))}
                  className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${tolerance}%, #404040 ${tolerance}%, #404040 100%)`,
                  }}
                />
                <span className="text-neutral-300 font-mono text-sm min-w-[3ch] text-right">
                  {tolerance}
                </span>
              </div>

              <div className="text-xs text-neutral-400">
                Higher values select more pixels with similar intensity
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => onToleranceChange(5)}
                  className="flex-1 px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300"
                >
                  Low (5)
                </button>
                <button
                  onClick={() => onToleranceChange(15)}
                  className="flex-1 px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300"
                >
                  Med (15)
                </button>
                <button
                  onClick={() => onToleranceChange(30)}
                  className="flex-1 px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300"
                >
                  High (30)
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
