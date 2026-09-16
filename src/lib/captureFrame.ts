/**
 * Working out which part of the camera frame the user actually saw.
 *
 * The preview is painted with `object-cover`: the frame is scaled until it
 * fills the box and whatever hangs over the edges is cropped. The capture has
 * to undo that mapping, or the photo sent for reading contains bands the
 * person framing the pack never saw — text they did not choose to photograph,
 * and framing brackets that promise something the app does not deliver.
 *
 * Kept out of the component because it is arithmetic, and arithmetic is worth
 * testing without a camera, a canvas or a browser.
 */

export interface CoverCrop {
  /** The rectangle to read out of the video frame. */
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  /** The canvas to draw it into, after any downscale. */
  width: number;
  height: number;
}

/**
 * @param maxEdge Longest edge of the result. A phone camera hands over far
 *   more detail than reading a name off a box needs, and every extra pixel is
 *   upload time on a connection that may be the reason somebody is standing in
 *   a pharmacy using this.
 */
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
  maxEdge = 1600,
): CoverCrop | null {
  if (!(videoWidth > 0 && videoHeight > 0 && boxWidth > 0 && boxHeight > 0)) return null;

  // The same rule the browser used to paint it: fill the box, crop the rest.
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);

  /*
    Whole pixels, clamped to the frame.

    Rounded because a fractional source rectangle makes drawImage resample a
    picture that did not need resampling. Clamped because a box with the
    frame's exact proportions lands a hair either side of it in floating
    point — 479.99999999999994 for a 480-wide frame — which is both a request
    for pixels that do not exist and, rounded the other way, a crop of an
    image that should not have been cropped at all.
  */
  const sourceWidth = Math.min(videoWidth, Math.round(boxWidth / scale));
  const sourceHeight = Math.min(videoHeight, Math.round(boxHeight / scale));

  const shrink = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));

  return {
    sourceX: Math.floor((videoWidth - sourceWidth) / 2),
    sourceY: Math.floor((videoHeight - sourceHeight) / 2),
    sourceWidth,
    sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * shrink)),
    height: Math.max(1, Math.round(sourceHeight * shrink)),
  };
}
