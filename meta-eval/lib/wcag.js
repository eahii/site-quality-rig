'use strict';
/* WCAG relative luminance and contrast ratio — a SECOND implementation, on purpose.

   This file is the yardstick the meta-evaluation holds against checks/check-contrast.js, so it
   may not import from checks/. A shared helper would make instrument and yardstick agree by
   construction, and an agreement number produced that way measures nothing: it is the same
   arithmetic compared with itself. Nothing below requires anything outside the node standard
   library, and the large-text rule is restated here rather than imported for the same reason
   the maths is.

   What the independence does NOT buy, stated plainly: this is an independent implementation of
   the SAME specification — WCAG 2.x relative luminance over 8-bit sRGB, the 0.05 offset, the
   0.04045 linearisation knee, the 0.2126/0.7152/0.0722 coefficients. Two implementations that
   misread the spec in the same way agree perfectly and report nothing. Independence here rules
   out a coding slip in one of them; it does not rule out a shared misreading.

   The mitigation is the anchor set in --self-test, and it is a mitigation rather than a proof:
   three pairs whose ratios are fixed points anyone can check by hand against the formula,
   asserted to 0.01.

     #000000 on #ffffff = 21.00:1   the definitional maximum: (1.00+0.05)/(0.00+0.05)
     #767676 on #ffffff =  4.54:1   the darkest of the standard grey pair, just over the 4.5 floor
     #777777 on #ffffff =  4.48:1   one step lighter, just under it

   The grey pair is the most-quoted worked example of the AA floor precisely because one step of
   the sRGB ramp straddles it, which also makes it the anchor most likely to catch a wrong
   linearisation: an implementation using the 2.2 power law instead of the piecewise curve puts
   #767676 at about 4.50 — 0.046 below the anchor, so it fails the 0.01 assertion, and it does so
   by landing on the wrong side of the floor the pair exists to straddle.

   Usage: node meta-eval/lib/wcag.js --self-test */

/* The linearisation is table-driven because every consumer feeds it 8-bit channels: 256 values
   exist, the search in gen-cases.js walks all of them millions of times, and a table makes the
   ratio for a given hex pair bit-for-bit the same on every call. */
const SRGB_LINEAR = Object.freeze(Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}));

const COEFF = Object.freeze([0.2126, 0.7152, 0.0722]);

const FLOOR_NORMAL = 4.5;
const FLOOR_LARGE = 3.0;

function parseHex(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) throw new Error(`not a six-digit hex colour: ${JSON.stringify(hex)}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb) {
  return `#${rgb.map((v) => {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error(`channel out of range: ${v}`);
    return v.toString(16).padStart(2, '0');
  }).join('')}`;
}

function relativeLuminance(rgb) {
  return COEFF[0] * SRGB_LINEAR[rgb[0]] + COEFF[1] * SRGB_LINEAR[rgb[1]] + COEFF[2] * SRGB_LINEAR[rgb[2]];
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const ratioHex = (fgHex, bgHex) => contrastRatio(parseHex(fgHex), parseHex(bgHex));

/* The same rule check-contrast.js:128 applies, written out a second time: >=24px, or >=18.66px
   at weight >=700, is large text and gets the 3.0 floor. */
const isLarge = (sizePx, weight) => sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
const floorFor = (sizePx, weight) => (isLarge(sizePx, weight) ? FLOOR_LARGE : FLOOR_NORMAL);

module.exports = {
  SRGB_LINEAR, COEFF, FLOOR_NORMAL, FLOOR_LARGE,
  parseHex, toHex, relativeLuminance, contrastRatio, ratioHex, isLarge, floorFor,
};

if (require.main === module && process.argv.includes('--self-test')) {
  const ANCHORS = [
    { fg: '#000000', bg: '#ffffff', want: 21.00 },
    { fg: '#767676', bg: '#ffffff', want: 4.54 },
    { fg: '#777777', bg: '#ffffff', want: 4.48 },
  ];
  const bad = [];
  for (const a of ANCHORS) {
    const got = ratioHex(a.fg, a.bg);
    const off = Math.abs(got - a.want);
    console.log(`${a.fg} on ${a.bg}: ${got.toFixed(4)}  want ${a.want.toFixed(2)}  off ${off.toFixed(4)}`);
    if (!(off <= 0.01)) bad.push(`${a.fg} on ${a.bg}: ${got.toFixed(4)} is not within 0.01 of ${a.want.toFixed(2)}`);
  }
  /* Two structural facts the anchors alone would not catch: the ratio is symmetric in its
     arguments, and the large-text rule sits exactly where the checker puts it. */
  if (Math.abs(ratioHex('#000000', '#ffffff') - ratioHex('#ffffff', '#000000')) > 1e-12) bad.push('contrastRatio is not symmetric');
  const RULE = [[16, 400, 4.5], [23.9, 400, 4.5], [24, 400, 3.0], [18.66, 700, 3.0], [18.65, 700, 4.5], [19, 600, 4.5]];
  for (const [size, weight, want] of RULE) {
    const got = floorFor(size, weight);
    console.log(`floor ${size}px/${weight} = ${got.toFixed(1)}  want ${want.toFixed(1)}`);
    if (got !== want) bad.push(`floorFor(${size}, ${weight}) = ${got}, want ${want}`);
  }
  if (bad.length) {
    console.log(`\nwcag self-test: ${bad.length} FAILED\n  ${bad.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nwcag self-test: ${ANCHORS.length + RULE.length + 1}/${ANCHORS.length + RULE.length + 1} assertions OK — PASS`);
  }
}
