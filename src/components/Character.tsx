import { forwardRef, useId, useImperativeHandle, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { characterDrawing, type CharacterBase, type CharacterState } from "@/lib/character";
import "../styles/characters.css";

export interface CharacterHandle {
  /** A quick hop: a moment answered (a reply landed, a step done). */
  pop(): void;
  blink(): void;
}

/** One agent character, drawn inline so its motion runs: it bobs, blinks, hops when it needs you, and looks at a pointer on it. */
export const Character = forwardRef<CharacterHandle, {
  base: CharacterBase;
  shell: string;
  state?: CharacterState;
  size?: number;
  label?: string;
  animated?: boolean;
  /** Turn the eyes toward a pointer over the character. */
  trackPointer?: boolean;
  className?: string;
}>(function Character({ base, shell, state = "idle", size = 44, label, animated = true, trackPointer = true, className }, ref) {
  const clip = useId().replace(/:/g, "");
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [beat, setBeat] = useState<{ kind: "pop" | "blink"; key: number } | null>(null);
  useImperativeHandle(ref, () => ({
    pop: () => setBeat({ kind: "pop", key: Date.now() }),
    blink: () => setBeat({ kind: "blink", key: Date.now() }),
  }));
  const drawing = characterDrawing({ base, shell, state, size, gaze, still: !animated });
  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setGaze({ x: ((event.clientX - box.left) / box.width - 0.5) * 2, y: ((event.clientY - box.top) / box.height - 0.5) * 2 });
  };
  const tracking = trackPointer && animated;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-character={base}
      data-character-state={state}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      onPointerMove={tracking ? onPointerMove : undefined}
      onPointerLeave={tracking ? () => setGaze(null) : undefined}
    >
      <svg viewBox={drawing.viewBox} width={size} height={size} aria-hidden="true" className="block overflow-visible">
        <defs><clipPath id={clip}><path d={drawing.body} /></clipPath></defs>
        <g key={beat?.kind === "pop" ? beat.key : 0} className={cn(drawing.motion, beat?.kind === "pop" && animated && "cf-pop")}>
          <g transform={drawing.lean || undefined}>
            <path d={drawing.body} fill="none" stroke={drawing.outline.color} strokeWidth={drawing.outline.width} strokeLinejoin="round" />
            <path d={drawing.body} fill={drawing.shell} />
            <rect x={0} y={drawing.sole.y} width={200} height={60} fill={drawing.sole.color} clipPath={`url(#${clip})`} />
            <rect x={drawing.visor.x} y={drawing.visor.y} width={drawing.visor.width} height={drawing.visor.height} rx={drawing.visor.rx} fill={drawing.visor.color} />
            {drawing.eyes.kind === "happy"
              ? <path d={drawing.eyes.d} fill="none" stroke={drawing.eyes.color} strokeWidth={drawing.eyes.width} strokeLinecap="round" />
              : (
                <g className={cn(drawing.eyes.scan && "cf-scan")}>
                  <g key={beat?.kind === "blink" ? beat.key : 0} className={cn(drawing.eyes.blink && "cf-blink", beat?.kind === "blink" && animated && "cf-blink-now")}>
                    {drawing.eyes.rects.map((eye, index) => (
                      <rect key={index} x={eye.x} y={eye.y} width={eye.width} height={eye.height} rx={eye.rx} fill={drawing.eyes.color} className="cf-eye" />
                    ))}
                  </g>
                </g>
              )}
          </g>
        </g>
      </svg>
    </span>
  );
});
