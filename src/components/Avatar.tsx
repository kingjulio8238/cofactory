import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { MASCOT_INK, type MausColor, type MausMotion, type MausState } from "@/lib/mascot";
import { DuskMark, type DuskMarkHandle } from "./mascot-view";
import { hoverGaze, type MarkReaction } from "./mascot-engine";
import { avatarCropRadius, botAvatarProfile, clampAvatarFocus, clampAvatarZoom, mascotFaceInk, type BotAvatarCrop, type MascotFaceColor } from "../../shared/bot-avatar";
import { bodyShapeFor, type StoredBodyId } from "../../shared/bot-body";
import { useHalloweenDressed, wornBody } from "@/lib/halloween-dress";
import { cofactoryEnabled } from "@/lib/feature-flags";
import { characterBase, characterState, SHELL_FOR_COLOR } from "@/lib/character-identity";
import { Character, type CharacterHandle } from "./Character";

export const EYE_SCALE = 1.12;
export const MOUTH_WEIGHT = 11;

interface MotionFaces
  extends Partial<
    Record<Exclude<MausMotion, "none">, { state?: MausState; blink?: boolean; spin?: number; react?: MarkReaction }>
  > {}

const MOTION_FACE: MotionFaces = {
  arrive: { state: "spawning", spin: 900 },
  switch: { react: "open" },
  customize: { state: "proud", blink: true },
  alert: { state: "alerting" },
  thinking: { state: "thinking" },
  working: { state: "working" },
  launch: { state: "loading" },
  success: { state: "happy", blink: true },
  celebrate: { state: "celebrate", spin: 700 },
  blink: { blink: true },
  surprise: { state: "surprised", blink: true },
  failure: { state: "sad" },
};

const MOTION_FACE_MS = 1400;

// a mark is one flat paint, no shading; a readable gradient paints with its middle stop
const inkFor = (color: MausColor, gradient?: [string, string, string]): string => gradient?.[1] ?? MASCOT_INK[color] ?? MASCOT_INK.green;

export function roomAvatarGradient(color: MausColor): [string, string, string] {
  const fill = `var(--identity-${color})`;
  return [
    `color-mix(in srgb, ${fill} 82%, #ffffff)`,
    fill,
    `color-mix(in srgb, ${fill} 82%, #000000)`,
  ];
}

export type MausAvatarHandle = Pick<DuskMarkHandle, "blink" | "spin" | "setExpression"> & Partial<Pick<DuskMarkHandle, "poke" | "react">>;

export type MausAvatarProps = {
  color: MausColor;
  /** Any mark state: idle rests, working and the other busy states move. */
  state?: MausState;
  /** A resting face looks up, surprised, while the pointer is on the status line. */
  emphasized?: boolean;
  /** CSS paint for the eyes, over the bot's face colour. */
  eyeInk?: string;
  expression?: number;
  size?: number;
  label?: string;
  motion?: MausMotion;
  motionKey?: number;
  turn?: number;
  gaze?: { x?: number; y?: number };
  spring?: number;
  eyeScale?: number;
  showMouth?: boolean;
  mouthStroke?: number;
  forward?: boolean;
  lookAround?: number;
  trackPointer?: boolean;
  animated?: boolean;
  bodyId?: StoredBodyId;
  gradient?: [string, string, string];
  faceColor?: MascotFaceColor | null;
  /** The bot whose app moments this mark answers (see mascot-events). */
  cueKey?: string;
  /** False keeps the mark still between turns: no blinks or glances of its own. */
  personality?: boolean;
};

function MausAvatarComponent(
  {
    color,
    state = "idle",
    emphasized,
    eyeInk,
    expression,
    size = 44,
    label,
    motion = "none",
    motionKey = 0,
    gaze,
    trackPointer = true,
    animated = true,
    bodyId,
    gradient,
    faceColor,
    cueKey,
    personality,
  }: MausAvatarProps,
  ref: React.Ref<MausAvatarHandle>,
) {
  const faceInk = mascotFaceInk(faceColor);
  const inner = useRef<DuskMarkHandle>(null);
  const character = useRef<CharacterHandle>(null);
  useImperativeHandle(ref, () => ({
    blink: () => (character.current ? character.current.blink() : inner.current?.blink()),
    spin: (durationMs?: number) => (character.current ? character.current.pop() : inner.current?.spin(durationMs)),
    setExpression: (index: number) => inner.current?.setExpression(index),
    poke: (kind) => (character.current ? character.current.pop() : inner.current?.poke(kind)),
    react: (kind) => (character.current ? character.current.pop() : inner.current?.react(kind)),
  }));

  const [motionState, setMotionState] = useState<MausState | null>(null);
  useEffect(() => {
    if (motion === "none" || !animated) return;
    const beat = MOTION_FACE[motion];
    if (!beat) return;
    if (beat.blink) inner.current?.blink();
    if (beat.spin) inner.current?.spin(beat.spin);
    if (beat.react) inner.current?.react(beat.react);
    if (!beat.state) return;
    setMotionState(beat.state);
    const timer = setTimeout(() => setMotionState(null), MOTION_FACE_MS);
    return () => clearTimeout(timer);
  }, [motion, motionKey, animated]);

  // the mark turns toward a pointer on it
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const tracking = trackPointer && animated;
  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const next = hoverGaze(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
    setPointer((current) => (current && current.x === next.x && current.y === next.y ? current : next));
  };
  const onPointerLeave = () => setPointer(null);
  const look = pointer ?? (gaze ? { x: gaze.x ?? 0, y: gaze.y ?? 0 } : null);

  // Cofactory's own characters in place of dusk's pixel marks: the bot's colour is its shell, its body its shape
  if (cofactoryEnabled()) {
    return (
      <Character ref={character} base={characterBase(bodyId, cueKey)} shell={SHELL_FOR_COLOR[color] ?? SHELL_FOR_COLOR.chrome}
        state={characterState(motionState ?? state)} size={size} animated={animated} trackPointer={trackPointer} label={label ?? ""} />
    );
  }

  return (
    <span
      className="inline-flex shrink-0"
      onPointerMove={tracking ? onPointerMove : undefined}
      onPointerLeave={tracking ? onPointerLeave : undefined}
    >
      <DuskMark
        ref={inner}
        body={bodyShapeFor(bodyId)}
        colour={inkFor(color, gradient)}
        eyes={eyeInk ?? faceInk ?? undefined}
        state={motionState ?? state}
        emphasized={emphasized}
        expression={expression}
        size={size}
        animated={animated}
        gaze={look}
        label={label ?? null}
        cueKey={cueKey}
        life={personality}
      />
    </span>
  );
}

export const MausAvatar = memo(forwardRef(MausAvatarComponent));

export type BotAvatarProps = Omit<MausAvatarProps, "color" | "gradient"> & {
  readable?: boolean;
  bot: {
    id?: string;
    name?: string;
    color: MausColor;
    avatarUrl?: string | null;
    avatarCrop?: BotAvatarCrop;
    avatarZoom?: number;
    avatarFocusX?: number;
    avatarFocusY?: number;
    mascotBody?: StoredBodyId | null;
    mascotFaceColor?: MascotFaceColor | null;
  };
};

export type BotAvatarOutcome = "flatImage" | "gradientMascot";

/** Mirrored name for name by resolveBotAvatarOutcome in ios/Sources/CompanionCore/BotAvatarRendering.swift. */
export function resolveBotAvatarOutcome(params: {
  avatarCrop: BotAvatarCrop;
  hasUrl: boolean;
  imageFailed: boolean;
}): BotAvatarOutcome {
  const { avatarCrop, hasUrl, imageFailed } = params;
  if (!hasUrl) return "gradientMascot";
  if (avatarCrop === "mascot") return "gradientMascot";
  if (imageFailed) return "gradientMascot";
  return "flatImage";
}

export function BotAvatar({ bot, size = 44, label, readable = false, ...mascotProps }: BotAvatarProps) {
  const profile = botAvatarProfile(bot);
  const dressed = useHalloweenDressed();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);

  const outcome = resolveBotAvatarOutcome({
    avatarCrop: profile.avatarCrop,
    hasUrl: Boolean(profile.avatarUrl),
    imageFailed,
  });

  if (outcome !== "flatImage") {
    return (
      <MausAvatar
        bodyId={cofactoryEnabled() && !bot.mascotBody ? undefined : wornBody(bot.mascotBody, bot.color, dressed)}
        {...mascotProps}
        color={bot.color}
        faceColor={bot.mascotFaceColor}
        gradient={readable ? roomAvatarGradient(bot.color) : undefined}
        size={size}
        label={label ?? bot.name}
        cueKey={mascotProps.cueKey ?? bot.id}
      />
    );
  }

  const radius = avatarCropRadius(profile.avatarCrop);
  const zoom = clampAvatarZoom(bot.avatarZoom ?? 1);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? 0.5);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? 0.5);
  const origin = `${focusX * 100}% ${focusY * 100}%`;
  return (
    <span
      className="relative block shrink-0 overflow-hidden bg-raised"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={profile.avatarUrl}
        alt={label ?? (bot.name ? `${bot.name} avatar` : "Bot avatar")}
        width={size}
        height={size}
        draggable={false}
        onError={() => setImageFailed(true)}
        className="block size-full max-w-none object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: origin,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: origin,
        }}
      />
    </span>
  );
}

export function InitialsAvatar({
  initials,
  avatarUrl,
  size = 32,
  fallback,
  fontSize,
  className,
}: {
  initials: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
  /** drawn instead of the initials, for a person with no name or email to take them from */
  fallback?: ReactNode;
  fontSize?: number;
}) {
  // A picture that is gone (a restored backup carries the address, not the file) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  if (avatarUrl && failed !== avatarUrl) {
    return <img src={avatarUrl} alt="" onError={() => setFailed(avatarUrl)} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary font-medium", className)}
      style={{ width: size, height: size, fontSize: fontSize ?? size * 0.38 }}
    >
      {fallback ?? initials}
    </div>
  );
}
