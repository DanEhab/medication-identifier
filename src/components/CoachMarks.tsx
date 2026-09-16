import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocalization } from '../context/LanguageContext';

/**
 * The tour.
 *
 * It points at things rather than describing them. A highlighted rectangle and
 * a paragraph leave the reader to work out which of the two they are meant to
 * look at; a hand resting on the control, tapping it, answers that before the
 * sentence is read — and the tap it performs is the gesture the sentence is
 * asking for.
 *
 * The spotlight is a single SVG mask rather than four dimming panels, so it can
 * move and resize between steps in one transition instead of four that have to
 * agree with each other.
 *
 * Shown once per installed version. Anybody who has seen it does not see it
 * again until there is something new to see.
 */

// ── When it runs ───────────────────────────────────────────────────────────

/** Injected at build time from package.json by vite.config.ts. */
declare const __APP_VERSION__: string;

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/**
 * One key per phase, holding the version that was last finished.
 *
 * The version lives in the value rather than in a separate marker: a stored
 * value that does not match this build means the tour has not been seen *for
 * this build*, which is the whole rule, and it cannot fall out of step with a
 * second key the way a separate version marker could.
 */
const SEEN_KEY = { 1: 'tourSeenVersion1', 2: 'tourSeenVersion2' } as const;

type Phase = 1 | 2;

const seenThisVersion = (phase: Phase): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY[phase]) === VERSION;
  } catch {
    // Storage unavailable: showing the tour again is the harmless direction.
    return false;
  }
};

const markSeen = (phase: Phase) => {
  try {
    localStorage.setItem(SEEN_KEY[phase], VERSION);
  } catch {
    /* It will be offered again next launch, which is no worse than this one. */
  }
};

export const shouldShowPhase1 = (): boolean => !seenThisVersion(1);
export const shouldShowPhase2 = (): boolean => !seenThisVersion(2);

export const resetTour = () => {
  try {
    localStorage.removeItem(SEEN_KEY[1]);
    localStorage.removeItem(SEEN_KEY[2]);
  } catch {
    /* Nothing stored to clear. */
  }
};

// ── What it points at ──────────────────────────────────────────────────────

interface Step {
  /** The data-tutorial value to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Corner radius of the cutout, matching the control underneath. */
  radius?: number;
  /** Extra room around the control, for something that sits tight in its box. */
  pad?: number;
}

const stepsFor = (phase: Phase, t: (key: any) => string): Step[] =>
  phase === 1
    ? [
        { target: 'viewfinder', title: t('tourScanTitle'), body: t('tourScanBody'), radius: 22 },
        { target: 'shutter', title: t('tourShutterTitle'), body: t('tourShutterBody'), radius: 999, pad: 6 },
        { target: 'type-instead', title: t('tourTypeTitle'), body: t('tourTypeBody'), radius: 999 },
        { target: 'language', title: t('tourLanguageTitle'), body: t('tourLanguageBody'), radius: 999, pad: 8 },
        /*
          Last, because it is in the tab bar at the foot of the screen and the
          two steps before it are in the header: ending here leaves the eye
          where the next tap is, instead of sending it back up.
        */
        { target: 'my-medicines', title: t('tourSavedTitle'), body: t('tourSavedBody'), radius: 14, pad: 4 },
      ]
    : [
        { target: 'quick-facts', title: t('tourFactsTitle'), body: t('tourFactsBody'), radius: 14 },
        { target: 'detail-chips', title: t('tourChipsTitle'), body: t('tourChipsBody'), radius: 999, pad: 6 },
        { target: 'professional-link', title: t('tourClinicalTitle'), body: t('tourClinicalBody'), radius: 16 },
        { target: 'save-medicine', title: t('tourSaveTitle'), body: t('tourSaveBody'), radius: 999, pad: 6 },
      ];

// ── Measuring ──────────────────────────────────────────────────────────────

interface Rect { top: number; left: number; width: number; height: number; }

/**
 * Follows the target's position for as long as it is on screen.
 *
 * Polled on a frame rather than measured once: the camera preview resizes as it
 * starts, a sticky bar moves when the page scrolls, and the keyboard changes
 * the viewport. A spotlight that measured once ends up beside the thing it is
 * meant to be on.
 */
function useTargetRect(target: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!target) { setRect(null); return; }

    let last = '';
    const measure = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`) as HTMLElement | null;
      if (el) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          const next = { top: box.top, left: box.left, width: box.width, height: box.height };
          const key = `${box.top}|${box.left}|${box.width}|${box.height}`;
          if (key !== last) { last = key; setRect(next); }
        }
      } else if (last !== 'gone') {
        last = 'gone';
        setRect(null);
      }
      frame.current = requestAnimationFrame(measure);
    };

    frame.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return rect;
}

// ── The hand ───────────────────────────────────────────────────────────────

/** A pointing hand, drawn rather than an emoji so it looks the same anywhere. */
const Hand: React.FC = () => (
  <svg viewBox="0 0 44 52" width="44" height="52" aria-hidden="true" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.35))' }}>
    <path
      d="M17.5 21.5V8.2a3.7 3.7 0 0 1 7.4 0v12.1m0-1.4a3.2 3.2 0 0 1 6.4 0v2.4m0-1.1a3.1 3.1 0 0 1 6.2 0v3.1
         m0-1.6a3 3 0 0 1 6 0v10.8c0 8.3-5.2 14.4-13.6 14.4-6.8 0-10.1-2.6-13.4-7.6L6.9 30
         a3.4 3.4 0 0 1 1.2-4.7 3.4 3.4 0 0 1 4.6 1.2l4.8 7.4"
      fill="var(--tour-hand-fill)"
      stroke="var(--tour-hand-stroke)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ── The tour ───────────────────────────────────────────────────────────────

interface CoachMarksProps {
  phase: Phase;
  onPhaseComplete: () => void;
}

/** Kept clear of the phone's rounded corners and any system bar. */
const EDGE = 16;
const CARD_GAP = 18;

export const CoachMarks: React.FC<CoachMarksProps> = ({ phase, onPhaseComplete }) => {
  const { t, language } = useLocalization();
  const [index, setIndex] = useState(0);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const steps = stepsFor(phase, t);
  const step = steps[index];
  const rect = useTargetRect(step?.target ?? null);

  const finish = useCallback(() => {
    markSeen(phase);
    onPhaseComplete();
  }, [phase, onPhaseComplete]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= steps.length) { finish(); return current; }
      return current + 1;
    });
  }, [steps.length, finish]);

  // Escape leaves, as it does from any other overlay in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  /*
    Bring the step's target into view before pointing at it.

    Three of the four result-screen steps start below the fold on a phone, and a
    spotlight on something off-screen is a dark screen with a card on it. The
    scrim itself is what stops the reader scrolling underneath — it covers the
    page and swallows the gesture — so the page is left scrollable and moved
    deliberately here instead of being locked.
  */
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    const comfortable = box.top > 72 && box.bottom < window.innerHeight - 200;
    if (!comfortable) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.getBoundingClientRect().height);
  }, [index, step?.title, step?.body]);

  /*
    A step whose target is not on screen is skipped rather than shown against
    an empty spotlight. That happens legitimately — the torch button is absent
    on a device without one — and the alternative is a card pointing at nothing.
  */
  useEffect(() => {
    if (!step) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (!el) next();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [step, next]);

  if (!step) return null;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const pad = step.pad ?? 10;
  const hole = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: Math.min(viewportW, rect.width + pad * 2),
        height: Math.min(viewportH, rect.height + pad * 2),
      }
    : null;

  // The card goes wherever there is more room, and the hand points from the
  // same side, so the two never argue about which way the eye should travel.
  const spaceBelow = hole ? viewportH - (hole.top + hole.height) : viewportH;
  const below = !hole || spaceBelow > cardHeight + CARD_GAP + 40;
  const cardTop = hole
    ? below
      ? Math.min(hole.top + hole.height + CARD_GAP, viewportH - cardHeight - EDGE)
      : Math.max(EDGE, hole.top - CARD_GAP - cardHeight)
    : Math.max(EDGE, (viewportH - cardHeight) / 2);

  /*
    The hand sits on the control, a little inside its lower corner, pointing up
    at it — the way a finger actually approaches a button. Which corner depends
    on the language: a right hand comes in from the right of a left-to-right
    screen and from the left of a right-to-left one, and coming in from the
    wrong side means the arm crosses the thing it is pointing at.
  */
  const rtl = language === 'ar';
  const handTop = hole ? hole.top + hole.height - 10 : 0;
  const handLeft = hole
    ? rtl
      ? Math.max(EDGE - 24, hole.left - 30)
      : Math.min(hole.left + hole.width - 14, viewportW - 54)
    : 0;

  const isLast = index === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9997]"
      role="dialog"
      aria-modal="true"
      aria-label={t('tourLabel')}
      data-testid="tour"
      /*
        A hand tapping the screen is an instruction to tap the screen, so the
        whole scrim advances. The card is excluded: its own two buttons say
        what they do, and a stray tap on the paragraph should not move on.
      */
      onClick={(event) => {
        if (cardRef.current?.contains(event.target as Node)) return;
        next();
      }}
    >
      {/* ── The spotlight ── */}
      <svg
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole && (
              <rect
                x={hole.left}
                y={hole.top}
                width={hole.width}
                height={hole.height}
                rx={Math.min(step.radius ?? 16, hole.height / 2)}
                fill="black"
                style={{ transition: 'x .34s cubic-bezier(.32,.72,0,1), y .34s cubic-bezier(.32,.72,0,1), width .34s, height .34s' }}
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="var(--tour-scrim)" mask="url(#tour-mask)" />
      </svg>

      {/* The ring around the cutout, so the edge reads on a busy photograph. */}
      {hole && (
        <div
          className="absolute tour-halo"
          aria-hidden="true"
          style={{
            top: hole.top, left: hole.left, width: hole.width, height: hole.height,
            borderRadius: Math.min(step.radius ?? 16, hole.height / 2),
            border: '2px solid var(--teal-light)',
            boxShadow: '0 0 0 4px rgba(127,189,180,.18)',
            pointerEvents: 'none',
            transition: 'all .34s cubic-bezier(.32,.72,0,1)',
          }}
        />
      )}

      {/* ── The hand ── */}
      {hole && (
        <div
          className="absolute"
          aria-hidden="true"
          style={{
            top: handTop, left: handLeft, pointerEvents: 'none',
            transition: 'top .34s cubic-bezier(.32,.72,0,1), left .34s cubic-bezier(.32,.72,0,1)',
          }}
        >
          <div className="relative" style={rtl ? { transform: 'scaleX(-1)' } : undefined}>
            <span
              className="tour-ripple absolute rounded-full"
              style={{
                width: 46, height: 46, top: -16, left: -12,
                border: '2px solid var(--teal-light)',
              }}
            />
            <div className="tour-hand"><Hand /></div>
          </div>
        </div>
      )}

      {/* ── What it says ── */}
      <div
        ref={cardRef}
        key={index}
        className="tour-card absolute bg-surface rounded-[20px] p-5"
        style={{
          top: cardTop,
          left: EDGE,
          right: EDGE,
          boxShadow: '0 12px 40px rgba(0,0,0,.28)',
          border: '1px solid var(--paper-sand)',
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-mono font-semibold text-[12px] tracking-[0.06em] text-ink-soft">
            {t('tourStep').replace('{n}', String(index + 1)).replace('{total}', String(steps.length))}
          </span>
          <button
            type="button"
            onClick={finish}
            data-testid="tour-skip"
            className="font-medium text-[15px] text-ink-soft underline underline-offset-2 px-1 active:scale-95 transition-transform"
          >
            {t('tourSkip')}
          </button>
        </div>

        <h2 className="font-semibold text-[21px] leading-[1.3] text-ink m-0 mb-1.5">{step.title}</h2>
        <p className="text-[17px] leading-[1.6] text-ink-dim m-0">{step.body}</p>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex gap-1.5 flex-1" aria-hidden="true">
            {steps.map((one, i) => (
              <span
                key={one.target}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 20 : 6,
                  background: i === index ? 'var(--teal)' : 'var(--paper-edge)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            data-testid="tour-next"
            className="h-[46px] px-6 rounded-full bg-teal font-semibold text-[17px] text-teal-on
              active:scale-[0.97] transition-transform"
          >
            {isLast ? t('tourDone') : t('tourNext')}
          </button>
        </div>
      </div>
    </div>
  );
};
