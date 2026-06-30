import { loadFont } from '@remotion/google-fonts/Montserrat';

// Montserrat is the product's body/UI font. @remotion/google-fonts integrates
// with Remotion's delayRender so frames wait for the font before painting.
export const { fontFamily: MONTSERRAT } = loadFont('normal', {
  weights: ['300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

// The wordmark should be MuseoSansCond (per web/app/globals.css), but the font
// file isn't in the repo yet. Fallback: Montserrat 800 + 0.13em tracking, which
// is the app's own documented fallback. Swap here once the .woff2 is supplied.
export const WORDMARK_FONT = MONTSERRAT;
export const WORDMARK_TRACKING = '-0.01em';
