import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────
//  Types & Config
// ─────────────────────────────────────────────

interface TutorialStep {
  id: string;
  target: string | null;          // data-tutorial attribute value; null = welcome card only
  title?: string;
  message: string;
  action?: string;                // button label override
  isWelcome?: boolean;
  isLastStep?: boolean;
  pinToBottom?: boolean;          // dock tooltip card to screen bottom instead of near spotlight
}

const PHASE1_STEPS: TutorialStep[] = [
  {
    id: 'p1s1',
    target: null,
    title: 'Welcome to Medication Identifier!',
    message: "Let's take a quick tour to show you how to safely and easily identify your medications.",
    action: 'Start Tour',
    isWelcome: true,
  },
  {
    id: 'p1s2',
    target: 'search-container',
    message:
      'Find medications in three easy ways: snap a fresh photo of the pill, upload an image from your gallery, or just type the name directly.',
    pinToBottom: true,
  },
  {
    id: 'p1s3',
    target: 'patient-details-card',
    message:
      'You can fill in your age and diagnosis here for more personalized context. This is completely optional and your data remains strictly private.',
  },
  {
    id: 'p1s4',
    target: 'globe-icon',
    message: 'Prefer to read in Arabic? Tap this globe at any time to instantly translate the app.',
  },
  {
    id: 'p1s5',
    target: 'hamburger-menu',
    message: 'Tap here to access your Saved Medications and to toggle between Light and Dark Mode.',
    isLastStep: true,
  },
];

const PHASE2_STEPS: TutorialStep[] = [
  {
    id: 'p2s1',
    target: 'tab-bar',
    message:
      'Swipe and tap through these tabs to quickly find the specific information you need.',
  },
  {
    id: 'p2s2',
    target: 'professional-link',
    message:
      'Are you a student or medical professional? Tap here for advanced clinical data and deep dives.',
    isLastStep: true,
  },
];

const TEAL = '#007B8A';
const STORAGE_KEY_P1 = 'tutorial_phase1_done';
const STORAGE_KEY_P2 = 'tutorial_phase2_done';

// ── Version-based tutorial reset ──────────────────────────────────────────────
// The version is injected at build time from package.json via vite.config.ts.
// Bumping the version in package.json automatically re-triggers the tutorial
// for all users (new or returning) on next app launch.
declare const __APP_VERSION__: string;
const TUTORIAL_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
const STORAGE_KEY_VERSION = 'tutorial_version';

(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VERSION);
    if (stored !== TUTORIAL_VERSION) {
      localStorage.removeItem(STORAGE_KEY_P1);
      localStorage.removeItem(STORAGE_KEY_P2);
      localStorage.setItem(STORAGE_KEY_VERSION, TUTORIAL_VERSION);
    }
  } catch (_) {
    // localStorage unavailable – silently skip
  }
})();
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Hook – spotlight rect tracker
// ─────────────────────────────────────────────

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function useSpotlight(target: string | null) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number>(0);

  const measure = useCallback(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector(`[data-tutorial="${target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [target]);

  // Scroll target into view (centred) then measure
  const focusTarget = useCallback(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector(`[data-tutorial="${target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // After scroll settles, measure
    const settle = setTimeout(() => {
      measure();
    }, 450);
    return () => clearTimeout(settle);
  }, [target, measure]);

  // Re-measure on resize / scroll
  useEffect(() => {
    const onUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onUpdate, { passive: true });
    window.addEventListener('scroll', onUpdate, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  return { rect, focusTarget };
}

// ─────────────────────────────────────────────
//  Toast Component
// ─────────────────────────────────────────────

const SuccessToast: React.FC<{ visible: boolean; phase: 1 | 2 }> = ({ visible, phase }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: 'fixed',
      bottom: 32,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 80}px)`,
      opacity: visible ? 1 : 0,
      transition: 'all 0.4s cubic-bezier(0.34,1.1,0.64,1)',
      background: TEAL,
      color: '#fff',
      borderRadius: 999,
      padding: '12px 28px',
      fontWeight: 700,
      fontSize: 15,
      boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
      zIndex: 99999,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}
  >
    {phase === 1 ? '🎉 Tour complete! You\'re all set.' : '✓ Results guide done!'}
  </div>
);

// ─────────────────────────────────────────────
//  PointingFinger – animated indicator
// ─────────────────────────────────────────────

const PointingFinger: React.FC<{ rect: SpotlightRect }> = ({ rect }) => {
  const fingerSize = 32;
  const top = rect.top + rect.height / 2 - fingerSize / 2;
  const left = rect.left + rect.width + 8;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top,
        left: Math.min(left, window.innerWidth - fingerSize - 8),
        fontSize: fingerSize,
        lineHeight: 1,
        zIndex: 9995,
        pointerEvents: 'none',
        animation: 'coachFingerBounce 1s ease-in-out infinite',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))',
      }}
    >
      👆
    </div>
  );
};

// ─────────────────────────────────────────────
//  Tooltip Card
// ─────────────────────────────────────────────

interface TooltipProps {
  step: TutorialStep;
  totalSteps: number;
  currentIndex: number;
  rect: SpotlightRect | null;
  onNext: () => void;
  onSkip: () => void;
  isWelcome?: boolean;
  pinToBottom?: boolean;
}

const CARD_WIDTH = 355;
const CARD_PADDING = 16;

function calcTooltipPos(rect: SpotlightRect, vh: number, vw: number, cardH: number) {
  const MARGIN = 16;
  const spotMidY = rect.top + rect.height / 2;
  let top: number;

  if (spotMidY > vh / 2) {
    // place above
    top = rect.top - cardH - MARGIN;
  } else {
    // place below
    top = rect.top + rect.height + MARGIN;
  }

  // clamp vertically
  top = Math.max(CARD_PADDING, Math.min(top, vh - cardH - CARD_PADDING));

  // centre horizontally over spotlight, clamp horizontally
  let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  left = Math.max(CARD_PADDING, Math.min(left, vw - CARD_WIDTH - CARD_PADDING));

  return { top, left };
}

const TooltipCard: React.FC<TooltipProps> = ({ step, totalSteps, currentIndex, rect, onNext, onSkip, isWelcome, pinToBottom }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!rect || pinToBottom) { setPos(null); return; }
    const cardH = cardRef.current?.offsetHeight ?? 180;
    setPos(calcTooltipPos(rect, window.innerHeight, window.innerWidth, cardH));
  }, [rect, pinToBottom]);

  const isLast = step.isLastStep;
  const buttonLabel = step.action ?? (isLast ? 'Got it!' : 'Next');

  // pinToBottom: dock card to screen bottom like a bottom sheet
  const style: React.CSSProperties = pinToBottom
    ? {
        position: 'fixed',
        bottom: 20,
        left: CARD_PADDING,
        right: CARD_PADDING,
        zIndex: 9998,
      }
    // centered position for welcome card
    : isWelcome || !rect || !pos
    ? {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: CARD_WIDTH,
        zIndex: 9998,
      }
    : {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: CARD_WIDTH,
        zIndex: 9998,
        transform: 'none',
      };

  return (
    <div
      ref={cardRef}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={step.title ?? step.message}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 28,
          padding: '16px 24px 24px',
          boxShadow: '0 20px 40px -8px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.4) inset',
          position: 'relative',
          animation: 'coachCardIn 0.4s cubic-bezier(0.34,1.5,0.64,1)',
        }}
      >
        {/* Skip row – always top-right, not absolute so it doesn't affect title centering */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button
            onClick={onSkip}
            aria-label="Skip tutorial"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: TEAL,
              fontWeight: 600,
              fontSize: 16,
              textDecoration: 'underline',
              padding: '2px 4px',
            }}
          >
            Skip
          </button>
        </div>

        {/* Step counter */}
        {!isWelcome && (
          <p
            style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 500, marginBottom: 8 }}
            aria-label={`Step ${currentIndex + 1} of ${totalSteps}`}
          >
            Step {currentIndex + 1} / {totalSteps}
          </p>
        )}

        {/* Title */}
        {step.title && (
          <h2
            style={{
              color: '#1A3A40', fontWeight: 800, fontSize: 22, marginBottom: 10,
              textAlign: 'center', lineHeight: 1.35,
            }}
            accessKey={step.title}
          >
            {step.title}
          </h2>
        )}

        {/* Body */}
        <p
          style={{ color: '#374151', fontSize: 16, lineHeight: 1.7, textAlign: 'center', marginBottom: 22 }}
          aria-label={step.message}
        >
          {step.message}
        </p>

        {/* Progress dots */}
        {!isWelcome && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === currentIndex ? 20 : 7,
                  height: 7,
                  borderRadius: 999,
                  background: i === currentIndex ? TEAL : '#D1D5DB',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={onNext}
          aria-label={buttonLabel}
          style={{
            display: 'block',
            width: '100%',
            background: TEAL,
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            border: 'none',
            borderRadius: 999,
            padding: '15px 20px',
            cursor: 'pointer',
            boxShadow: `0 4px 20px rgba(0,123,138,0.4)`,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 24px rgba(0,123,138,0.55)`;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px rgba(0,123,138,0.4)`;
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  Spotlight Overlay
// ─────────────────────────────────────────────

const SpotlightOverlay: React.FC<{ rect: SpotlightRect | null; isWelcome?: boolean }> = ({ rect, isWelcome }) => {
  const PADDING = 8;

  return (
    <>
      {/* Full-screen interaction blocker – sits above the app, below the tutorial UI.
          Catches ALL touches so the user can't interact with the app during the tour. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9988,
          background: 'transparent',
          pointerEvents: 'all',
        }}
      />

      {/* Full-screen dim layer */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9989,
          background: 'rgba(0,0,0,0)',
          pointerEvents: 'none',
        }}
      />

      {/* Spotlight window – box-shadow punches a "hole" in the darkness */}
      {rect && !isWelcome && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            borderRadius: 14,
            zIndex: 9990,
            pointerEvents: 'none',
            boxShadow: `
              0 0 0 9999px rgba(0, 0, 0, 0.68),
              0 0 0 3px rgba(255,255,255,0.25),
              0 0 20px 8px rgba(0,183,169,0.35)
            `,
            transition: 'top 0.35s ease, left 0.35s ease, width 0.35s ease, height 0.35s ease',
          }}
        />
      )}

      {/* Welcome dimming (no hole) */}
      {isWelcome && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9991,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────
//  Main CoachMarks Component
// ─────────────────────────────────────────────

export interface CoachMarksProps {
  phase: 1 | 2;
  onPhaseComplete: () => void;
}

export const CoachMarks: React.FC<CoachMarksProps> = ({ phase, onPhaseComplete }) => {
  const steps = phase === 1 ? PHASE1_STEPS : PHASE2_STEPS;

  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(true);   // true = tutorial UI + blocking overlay active
  const [toastOnly, setToastOnly] = useState(false); // true = only toast remains, app fully usable
  const [toastVisible, setToastVisible] = useState(false);

  // Lock body scroll ONLY while tutorial overlay is active (visible=true)
  useEffect(() => {
    if (!visible) return; // already unlocked when tutorial steps end
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  const currentStep = steps[stepIndex];
  const { rect, focusTarget } = useSpotlight(currentStep?.target ?? null);

  // Focus & auto-scroll when step changes
  useEffect(() => {
    if (!currentStep?.target) return;
    const cleanup = focusTarget();
    return cleanup;
  }, [stepIndex, focusTarget, currentStep?.target]);

  // Dismiss permanently
  const dismiss = useCallback((completed = false) => {
    // Immediately remove the overlay + unblock the app
    setVisible(false);
    const key = phase === 1 ? STORAGE_KEY_P1 : STORAGE_KEY_P2;
    localStorage.setItem(key, 'true');

    const TOAST_DURATION = 6000;
    if (completed) {
      // Show toast while app is already fully interactive
      setToastOnly(true);
      setToastVisible(true);
      setTimeout(() => {
        setToastVisible(false);
        // Small extra delay for fade-out animation, then unmount
        setTimeout(() => {
          setToastOnly(false);
          onPhaseComplete();
        }, 500);
      }, TOAST_DURATION);
    } else {
      // Skip – no toast, just notify parent immediately
      onPhaseComplete();
    }
  }, [phase, onPhaseComplete]);

  const handleNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss(true);
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length, dismiss]);

  const handleSkip = useCallback(() => {
    dismiss(false);
  }, [dismiss]);

  if (!visible || !currentStep) {
    // Once steps are done, only show the toast – everything else is gone
    if (!toastOnly) return null;
    return <SuccessToast visible={toastVisible} phase={phase} />;
  }

  const isWelcome = currentStep.isWelcome === true;

  return (
    <>
      {/* Inject keyframe animations once */}
      <style>{`
        @keyframes coachCardIn {
          from { opacity: 0; transform: scale(0.88) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes coachFingerBounce {
          0%, 100% { transform: translateX(0); }
          50%       { transform: translateX(-6px); }
        }
      `}</style>

      <SpotlightOverlay rect={rect} isWelcome={isWelcome} />

      {rect && !isWelcome && <PointingFinger rect={rect} />}

      <TooltipCard
        step={currentStep}
        totalSteps={steps.length}
        currentIndex={stepIndex}
        rect={isWelcome ? null : rect}
        onNext={handleNext}
        onSkip={handleSkip}
        isWelcome={isWelcome}
        pinToBottom={currentStep.pinToBottom}
      />

      <SuccessToast visible={toastVisible} phase={phase} />
    </>
  );
};

// ─────────────────────────────────────────────
//  Utility exports for App.tsx
// ─────────────────────────────────────────────

export function shouldShowPhase1(): boolean {
  return localStorage.getItem(STORAGE_KEY_P1) !== 'true';
}

export function shouldShowPhase2(): boolean {
  return localStorage.getItem(STORAGE_KEY_P2) !== 'true';
}

export function resetPhase1Tutorial(): void {
  localStorage.removeItem(STORAGE_KEY_P1);
}

export function resetPhase2Tutorial(): void {
  localStorage.removeItem(STORAGE_KEY_P2);
}
