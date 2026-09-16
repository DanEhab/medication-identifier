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

/**
 * The pointing hand, taken from the touch animation.
 *
 * The artwork is the one from the Lottie file, converted to two SVG paths: the
 * outer edge of the hand, and the inner edge that makes the drawing an outline
 * rather than a blob. Drawing the outer one filled and then both together with
 * an even-odd rule paints the ring between them — a white hand with a dark
 * outline, which is what the Lottie renders.
 *
 * Converted rather than played. The animation in that file is a press and a
 * ripple, which is exactly what the CSS here already does; running it properly
 * would mean a Lottie renderer, and lottie-web is about 60KB gzipped against a
 * 110KB bundle — more than half as much again, to animate something already
 * animated.
 */
const HAND_OUTER = 'M125.44,57.00C121.56,57.00 117.76,58.07 114.46,60.11C109.56,49.61 97.07,45.07 86.57,49.97C86.53,49.99 86.48,50.01 86.44,50.03C86.44,50.03 86.44,21.00 86.44,21.00C86.44,9.40 77.04,0.00 65.44,0.00C53.84,0.00 44.44,9.40 44.44,21.00C44.44,21.00 44.44,89.56 44.44,89.56C44.44,89.56 39.19,80.47 39.19,80.47C33.39,70.42 20.55,66.98 10.50,72.78C0.55,78.53 -2.94,91.21 2.69,101.24C27.02,152.55 43.23,174.00 80.44,174.00C116.87,173.96 146.40,144.43 146.44,108.00C146.44,108.00 146.44,78.00 146.44,78.00C146.43,66.41 137.03,57.01 125.44,57.00Z';
const HAND_INNER = 'M134.44,108.00C134.41,137.81 110.25,161.97 80.44,162.00C65.31,162.00 54.77,157.91 45.21,148.32C35.84,138.92 26.63,123.73 13.44,95.89C13.37,95.75 13.29,95.61 13.21,95.47C10.72,91.16 12.20,85.66 16.50,83.17C20.81,80.69 26.31,82.16 28.80,86.47C28.80,86.47 45.24,114.95 45.24,114.95C46.90,117.82 50.57,118.80 53.44,117.15C55.30,116.07 56.44,114.09 56.44,111.95C56.44,111.95 56.44,21.00 56.44,21.00C56.44,16.03 60.47,12.00 65.44,12.00C70.41,12.00 74.44,16.03 74.44,21.00C74.44,21.00 74.44,72.00 74.44,72.00C74.44,75.31 77.13,78.00 80.44,78.00C83.75,78.00 86.44,75.31 86.44,72.00C86.44,72.00 86.44,69.00 86.44,69.00C86.44,64.03 90.47,60.00 95.44,60.00C100.41,60.00 104.44,64.03 104.44,69.00C104.44,69.00 104.44,78.00 104.44,78.00C104.44,81.31 107.13,84.00 110.44,84.00C113.75,84.00 116.44,81.31 116.44,78.00C116.44,73.03 120.47,69.00 125.44,69.00C130.41,69.00 134.44,73.03 134.44,78.00C134.44,78.00 134.44,108.00 134.44,108.00Z';

const Hand: React.FC = () => (
  <svg
    viewBox="-8 -6 164 188"
    width="44"
    height="50"
    aria-hidden="true"
    style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.28))' }}
  >
    <path d={HAND_OUTER} fill="var(--tour-hand-fill)" />
    <path d={`${HAND_OUTER} ${HAND_INNER}`} fillRule="evenodd" fill="var(--tour-hand-stroke)" />
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

/** The hand's own box, needed before it is drawn in order to place it. */
const HAND_W = 44;
const HAND_H = 50;

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

  /*
    The card goes on the side that actually has room for it.

    The rule used to be "below unless the gap beneath is smaller than the card
    plus a margin", with no check that the space *above* was any better. On the
    viewfinder step the gap beneath is a few pixels either side of that
    threshold — and the Arabic card is nine pixels taller than the English one,
    which was enough to tip it. Arabic flipped the card to the top of the
    screen, where it did not fit either, so it was clamped to the edge and
    landed on top of the header and half the spotlight. Same code, same screen,
    unrecognisably different layout, decided by the length of a sentence.

    So: below if it fits below, above if it fits above, and if neither fits,
    the roomier side — which only happens when the cutout is nearly the whole
    screen and some overlap is unavoidable.
  */
  const spaceBelow = hole ? viewportH - (hole.top + hole.height) : viewportH;
  const spaceAbove = hole ? hole.top : 0;
  const needed = cardHeight + CARD_GAP + EDGE;
  const below = !hole
    || spaceBelow >= needed
    || (spaceAbove < needed && spaceBelow >= spaceAbove);
  const cardTop = hole
    ? below
      ? Math.min(hole.top + hole.height + CARD_GAP, viewportH - cardHeight - EDGE)
      : Math.max(EDGE, hole.top - CARD_GAP - cardHeight)
    : Math.max(EDGE, (viewportH - cardHeight) / 2);

  /*
    Where the hand goes, chosen rather than assumed.

    It used to sit just under the control's lower corner, always. That works
    for a button with room beneath it and fails everywhere else: under the
    viewfinder, under the language button in the header, and under the tab bar
    at the foot of the screen, the card is exactly where the hand wants to be,
    and the hand went behind it. Three of the five steps showed no hand at all.

    So the candidates are tried in order of how a finger would really approach
    the thing, and the first that is fully on screen and clear of the card
    wins. Inside the control comes first for anything big enough to hold a
    hand — on the viewfinder that reads as "tap in here", which is the
    instruction — and outside it for the small controls.
  */
  const rtl = language === 'ar';
  const cardRect = { top: cardTop, bottom: cardTop + cardHeight, left: EDGE, right: viewportW - EDGE };

  const handPlacement = (() => {
    if (!hole) return { top: 0, left: 0 };

    // The side a right hand comes in from: from the right of a left-to-right
    // screen and the left of a right-to-left one, so the arm never crosses
    // the thing it is pointing at.
    const nearX = rtl
      ? hole.left - HAND_W + 14
      : hole.left + hole.width - 14;
    const insideX = rtl
      ? hole.left + 10
      : hole.left + hole.width - HAND_W - 10;
    const centreX = hole.left + (hole.width - HAND_W) / 2;

    const candidates = [
      /*
        Inside the control, near its lower edge — but only for something the
        size of the viewfinder, where the hand reads as "tap in here". On a
        shutter button barely larger than the hand it covers the very control
        it is pointing at, so a generous threshold, not a tight one.
      */
      hole.height > 150 && hole.width > 150
        ? { top: hole.top + hole.height - HAND_H - 10, left: insideX }
        : null,
      // Just below it, the way a thumb comes up to a button.
      { top: hole.top + hole.height - 10, left: nearX },
      // Above it, for a control sitting on the floor of the screen.
      { top: hole.top - HAND_H + 10, left: nearX },
      // Beside it, for a control pinned to the top with the card beneath.
      { top: hole.top + (hole.height - HAND_H) / 2, left: rtl ? hole.left - HAND_W - 4 : hole.left + hole.width + 4 },
      { top: hole.top + (hole.height - HAND_H) / 2, left: rtl ? hole.left + hole.width + 4 : hole.left - HAND_W - 4 },
      // Centred under it, when the sides are what is blocked.
      { top: hole.top + hole.height + 6, left: centreX },
    ].filter(Boolean) as { top: number; left: number }[];

    const onScreen = (p: { top: number; left: number }) =>
      p.top >= 0 && p.left >= 0
      && p.top + HAND_H <= viewportH && p.left + HAND_W <= viewportW;

    const clearOfCard = (p: { top: number; left: number }) =>
      p.top + HAND_H <= cardRect.top || p.top >= cardRect.bottom
      || p.left + HAND_W <= cardRect.left || p.left >= cardRect.right;

    return candidates.find((p) => onScreen(p) && clearOfCard(p))
      // Nothing fits: put it where it is at least on screen, rather than
      // hiding it. A hand half behind the card still says which control.
      || candidates.find(onScreen)
      || candidates[0];
  })();

  const rawHandTop = handPlacement.top;
  const rawHandLeft = handPlacement.left;

  /*
    Tilt the hand toward what it is pointing at.

    The finger points straight up, which is right when the hand is directly
    beneath its target and wrong everywhere else — beside the language button
    in the header it pointed at the ceiling, and beside the saved-medicines tab
    it pointed past it. The angle is taken from the fingertip to the middle of
    the cutout, so it follows the placement instead of being guessed per step.

    Only when the hand is outside the cutout: inside one, "toward the middle"
    is backwards. Clamped, because a hand at forty-five degrees reads as
    pointing and one at ninety reads as falling over.
  */
  const tilt = (() => {
    if (!hole) return 0;
    const tipX = rawHandLeft + HAND_W * 0.44;
    const tipY = rawHandTop + HAND_H * 0.04;
    const inside = tipX > hole.left && tipX < hole.left + hole.width
      && tipY > hole.top && tipY < hole.top + hole.height;
    if (inside) return 0;

    const dx = hole.left + hole.width / 2 - tipX;
    const dy = hole.top + hole.height / 2 - tipY;
    const degrees = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (Math.abs(degrees) < 8) return 0;
    // Thirty-two degrees reads as leaning toward something. Forty-eight, which
    // is what the raw angle comes to for a hand tucked close under a small
    // button, reads as a hand falling over.
    return Math.max(-32, Math.min(32, degrees));
  })();

  /*
    Rotating a box makes it bigger, so the position has to be nudged back.

    Placement is worked out on the upright hand; tilting it turns a 44x50 box
    into roughly 64x66, and at the top of the screen that pushed the fingertip
    off the edge. The corners are rotated properly rather than padded
    symmetrically, because the hand pivots on its fingertip rather than its
    middle, so the box does not grow evenly on all four sides.
  */
  const spread = (() => {
    const radians = tilt * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const originX = HAND_W * 0.44;
    const originY = HAND_H * 0.04;
    const corners = [[0, 0], [HAND_W, 0], [HAND_W, HAND_H], [0, HAND_H]].map(([x, y]) => {
      const dx = x - originX;
      const dy = y - originY;
      return [originX + dx * cos - dy * sin, originY + dx * sin + dy * cos];
    });
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return {
      left: Math.min(...xs), right: Math.max(...xs),
      top: Math.min(...ys), bottom: Math.max(...ys),
    };
  })();

  // A pixel of margin, because the corners are rotated in floating point and
  // landing exactly on the edge rounds to a hair outside it.
  const MARGIN = 1;
  const handTop = Math.max(MARGIN - spread.top, Math.min(rawHandTop, viewportH - spread.bottom - MARGIN));
  const handLeft = Math.max(MARGIN - spread.left, Math.min(rawHandLeft, viewportW - spread.right - MARGIN));

  const isLast = index === steps.length - 1;

  return (
    <div
      /*
        Nothing here is worth copying, and a long press on it was selecting
        the step text and raising Android's Copy / Share / Select all bar over
        the tour — on top of the very buttons that move it along.
      */
      className="fixed inset-0 z-[9997] select-none"
      style={{ WebkitTouchCallout: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('tourLabel')}
      data-testid="tour"
      /*
        Tapping the scrim does nothing on purpose.

        It used to advance, on the reasoning that a hand tapping the screen is
        an instruction to tap the screen. In use that reads as a tour running
        away with itself: a finger resting anywhere, a mis-aimed press at the
        card, the edge of a thumb — and a step is gone before it was read.
        Next and Skip are the only two things that move it.
      */
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
            top: handTop,
            left: handLeft,
            pointerEvents: 'none',
            transform: `rotate(${tilt}deg)`,
            // Around the fingertip, so the hand pivots on the point it touches
            // rather than swinging the tip away from the control.
            transformOrigin: '44% 4%',
            transition: 'top .34s cubic-bezier(.32,.72,0,1), left .34s cubic-bezier(.32,.72,0,1),'
              + ' transform .34s cubic-bezier(.32,.72,0,1)',
          }}
        >
          <div className="relative" style={rtl ? { transform: 'scaleX(-1)' } : undefined}>
            {/* Around the fingertip, because that is where a tap lands. */}
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
