import React from 'react';
import type { DosageForm } from '../lib/dosageForm';

/**
 * A drawing of the thing in the box.
 *
 * Line art on a tinted tile rather than a photograph or an emoji: it has to
 * read at forty-four pixels, survive the dark theme, and sit beside the
 * medicine's name without competing with it. One stroke weight throughout, and
 * every shape drawn inside the same 24-unit square so none of them looks
 * heavier than the others.
 *
 * The unknown mark is deliberately not a tablet. Showing a tablet for an
 * answer that never said it was a tablet is a small confident lie, and the
 * whole point of the picture is to let somebody notice a mismatch with what is
 * in their hand.
 */

const ART: Record<DosageForm, React.ReactNode> = {
  // A round tablet with its score line.
  tablet: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4.6v14.8" />
    </>
  ),
  // Two halves of a capsule, joined across the middle.
  capsule: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M12 8v8" />
    </>
  ),
  // A bottle with a neck, a shoulder and a fill line.
  liquid: (
    <>
      <path d="M10 3h4v3.2l2.6 2.8A3 3 0 0 1 17.4 12v6.5a2.5 2.5 0 0 1-2.5 2.5h-5.8A2.5 2.5 0 0 1 6.6 18.5V12a3 3 0 0 1 .8-2L10 6.2z" />
      <path d="M6.7 14h10.6" />
    </>
  ),
  // A dropper with a bulb, and the drop leaving it.
  drops: (
    <>
      <path d="M11 3h4v2h-4z" />
      <path d="M11.4 5.2 9.6 13.4A2.6 2.6 0 0 0 12.1 16.6h1.8a2.6 2.6 0 0 0 2.5-3.2L14.6 5.2z" />
      <path d="M6.6 21c-1 0-1.7-.8-1.7-1.7 0-1 1.7-3 1.7-3s1.7 2 1.7 3c0 1-.8 1.7-1.7 1.7z" />
    </>
  ),
  // A tube with a crimped end and a cap.
  cream: (
    <>
      <path d="M6.5 8.5h11V18a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 18z" />
      <path d="M6.5 8.5 8.2 5h7.6l1.7 3.5" />
      <path d="M10.5 3h3v2h-3z" />
    </>
  ),
  // A pressurised canister in its L-shaped mouthpiece.
  inhaler: (
    <>
      <path d="M9 3.5h4.5v6H9z" />
      <path d="M8 9.5h6.5v6.2a2 2 0 0 0 2 2H19v3H10a2 2 0 0 1-2-2z" />
    </>
  ),
  // A syringe on the diagonal, with its plunger and needle.
  injection: (
    <>
      <path d="M13.2 6.6 17.4 10.8" />
      <path d="M8.4 11.4 12.6 15.6" />
      <path d="m10.3 9.5 4.2 4.2-4 4a2 2 0 0 1-2.9 0l-1.3-1.3a2 2 0 0 1 0-2.9z" />
      <path d="m14.2 5.6 4.2 4.2" />
      <path d="M17 13 21 9" />
      <path d="m6.6 17.4-3 3" />
    </>
  ),
  // A bullet-shaped suppository.
  suppository: (
    <>
      <path d="M12 3c2.6 2.6 4 5.6 4 8.6 0 4.2-1.8 9.4-4 9.4s-4-5.2-4-9.4C8 8.6 9.4 5.6 12 3z" />
      <path d="M8.3 14h7.4" />
    </>
  ),
  // A rounded patch with its adhesive texture.
  patch: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  // A bottle with a trigger nozzle, and the spray leaving it.
  spray: (
    <>
      <path d="M8.5 9h7v9.5a2.5 2.5 0 0 1-2.5 2.5h-2A2.5 2.5 0 0 1 8.5 18.5z" />
      <path d="M10 9V6.5h4V9" />
      <path d="M14 4.2h2.6" />
      <path d="M14 6.6h3.4" />
      <path d="M15 2.2h2" />
    </>
  ),
  // A sealed sachet with a serrated top edge.
  sachet: (
    <>
      <path d="M5.5 6.5h13V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" />
      <path d="m5.5 6.5 1.6-1.5 1.6 1.5L10.3 5l1.7 1.5L13.7 5l1.6 1.5L16.9 5l1.6 1.5" />
      <path d="M9 11.5h6" />
    </>
  ),
  /*
    Not a medicine, a mark for one: a pill-and-mortar cross in a rounded
    lozenge. It says "medicine of some kind" without claiming a shape.
  */
  unknown: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </>
  ),
};

interface DosageFormIconProps {
  form: DosageForm;
  /** The tile's edge. The drawing is sized from it. */
  size?: number;
  className?: string;
}

export const DosageFormIcon: React.FC<DosageFormIconProps> = ({ form, size = 44, className = '' }) => (
  <span
    className={`rounded-[11px] shrink-0 flex items-center justify-center ${className}`}
    style={{ width: size, height: size, background: 'var(--teal-wash)' }}
    aria-hidden="true"
    data-testid="dosage-form-icon"
    data-form={form}
  >
    <svg
      viewBox="0 0 24 24"
      width={Math.round(size * 0.58)}
      height={Math.round(size * 0.58)}
      fill="none"
      stroke="var(--teal)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ART[form] ?? ART.unknown}
    </svg>
  </span>
);
