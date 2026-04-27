'use client';

interface TooltipState {
  x: number;
  y: number;
  content: string;
}

interface Props {
  tooltip: TooltipState | null;
}

export default function MapTooltip({ tooltip }: Props) {
  if (!tooltip) return null;
  return (
    <div
      className="pointer-events-none absolute bg-black/90 text-white text-xs px-2 py-1 rounded shadow-lg border border-white/20 whitespace-pre-line"
      style={{
        left: `${tooltip.x + 10}px`,
        top: `${tooltip.y - 30}px`,
        transform: 'translateY(-100%)',
      }}
    >
      {tooltip.content}
    </div>
  );
}
