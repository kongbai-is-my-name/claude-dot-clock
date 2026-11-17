// Dot Glyph: a dot-matrix clock over a pixel-art sky whose weather follows the clock's city.
// Pure string building: no DOM, no imports.
// The frame the scene is drawn in runs no script, so the clock is CSS: every digit is a strip of glyphs behind a
// one-cell window, stepped along by an animation whose negative delay is the time the scene was built at.
// EVERY MOVING PART ALSO RESTS RIGHT: its attributes hold the picture of the moment the scene was built, and the
// animation only carries it on from there. Where a window stops a scene's motion the clock still reads the time of
// the last redraw (the mod redraws every three minutes), and the seconds and the minute's row, which would be
// stale, stay hidden.
// All timing lives in the one <style> block: no element carries a style attribute.
// The clock's digits always step. The sky has two gaits: `smooth` glides its clouds, rain, snow and fog, repainting
// at every frame; without it they move a pixel at a time and the window paints a few times a second, not sixty.

const WIDTH = 1600
const HEIGHT = 1000
const UNIT = 8
const COLS = WIDTH / UNIT
const INK = '#1c2a8c'
const PLUM = '#7a2d6b'
const REST = '#eef2ff'
const TEXT = '#1d2140'

// The big digits' lattice: a 5x7 face, one cell 22 units, a strip's step 8 rows so a gap parts the glyphs.
const PITCH = 22
const STEP = PITCH * 8
const CELL_W = PITCH * 5
const CELL_H = PITCH * 7
const ADVANCE = PITCH * 6

// A 5x7 dot-matrix face. Each glyph is 7 rows, each row 5 bits, the left dot the high bit.
const FACE: Record<string, readonly number[]> = {
  '0': [14, 17, 17, 17, 17, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '-': [0, 0, 0, 31, 0, 0, 0],
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/** A place on the clock: the name to print, and the minutes to add to UTC for its wall clock now. */
export type Place = { label: string; offsetMinutes: number }

/** The sky over the big clock's city. */
export type Weather = {
  kind: 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'
  isDay: boolean
  /** Degrees Celsius. */
  temperature: number
}

/** What the scene needs of the moment it is built at. */
export type Moment = {
  /** Milliseconds since the epoch. */
  now: number
  /** The city of the big clock. */
  main: Place
  /** The city of the small line under it; absent, no line. */
  second?: Place
  /** The weather to draw; absent, a plain day with a few clouds. */
  weather?: Weather
  /** Whether clouds, rain, snow and fog glide (true) or move a pixel at a time, which costs a window less. */
  smooth?: boolean
}

/** Whether the dot-matrix face has a glyph for every letter of `text` (a space is one too). */
export function canPrint(text: string): boolean {
  return [...text].every(letter => letter === ' ' || FACE[letter] !== undefined)
}

/** Path data for a line of text: one zero-length stroke per lit dot, drawn as a disc by a round line cap. */
function dots(text: string, x: number, y: number, pitch: number): string {
  let d = ''
  let column = 0
  for (const letter of text) {
    const rows = FACE[letter]
    rows?.forEach((row, r) => {
      for (let c = 0; c < 5; c += 1) {
        if ((row >> (4 - c)) & 1) {
          d += `M${x + (column + c) * pitch + pitch / 2} ${y + r * pitch + pitch / 2}h0`
        }
      }
    })
    column += 6
  }
  return d
}

/** How wide `dots` draws `text`. */
function widthOf(text: string, pitch: number): number {
  return ([...text].length * 6 - 1) * pitch
}

/** A vertical strip of the given texts on the big lattice, one per step. */
function strip(id: string, texts: readonly string[]): string {
  let d = ''
  texts.forEach((text, i) => {
    d += dots(text, 0, i * STEP, PITCH)
  })
  return `<path id="${id}" fill="none" stroke-linecap="round" stroke-width="17.5" d="${d}"/>`
}

/** A row of `count` discs as one path. */
function row(count: number, x: number, y: number, pitch: number): string {
  let d = ''
  for (let i = 0; i < count; i += 1) d += `M${x + i * pitch} ${y}h0`
  return d
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

/** A small generator with a fixed seed: the same sky every time. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A filled disc of square pixels, in cells. */
function disc(cx: number, cy: number, r: number): string {
  let d = ''
  for (let dy = -r; dy <= r; dy += 1) {
    const half = Math.floor(Math.sqrt((r + 0.3) * (r + 0.3) - dy * dy))
    d += `M${cx - half} ${cy + dy}h${2 * half + 1}v1h${-(2 * half + 1)}z`
  }
  return d
}

/** A stepped skyline, one pixel column at a time, filled to the foot of the sheet. */
function ridge(color: string, heightAt: (x: number) => number): string {
  let d = `M0 ${HEIGHT}`
  for (let x = 0; x < COLS; x += 1) d += `V${heightAt(x) * UNIT}H${(x + 1) * UNIT}`
  return `<path fill="${color}" d="${d}V${HEIGHT}z"/>`
}

const CLOUD_ROWS = ['....######........', '..##########.####.', '.#################', '##################', '.################.'] as const
// Where each cloud floats: its top, its size in pixels per cell, the seconds of one crossing, and how far in it starts.
const CLOUDS: readonly (readonly [number, number, number, number])[] = [
  [64, 2, 420, 60], [248, 1, 300, 190], [600, 1, 360, 20], [136, 1, 260, 110], [520, 2, 480, 330], [330, 2, 380, 250], [20, 1, 340, 300], [440, 1, 280, 70],
]
const WORDS: Record<Weather['kind'], string> = { clear: 'CLEAR', cloudy: 'CLOUDY', fog: 'FOG', rain: 'RAIN', snow: 'SNOW', storm: 'STORM' }
const CLOUD_COUNT: Record<Weather['kind'], number> = { clear: 2, cloudy: 8, fog: 3, rain: 6, snow: 5, storm: 8 }

/** The whole scene for the moment given: one SVG whose own CSS keeps the time from there on. */
export function dotGlyphSvg(moment: Moment, level = 0): string {
  // `level` is for finding what stills the scene in a window: each step up leaves one more part out.
  // 2: nothing in the sky; 3: a plain ground; 4: no progress rows; 5: no seconds and no second city;
  // 6: only the rules the big clock needs; 7: only the colon.
  // A city's wall clock, read off a date shifted by its offset and taken as UTC.
  const local = new Date(moment.now + moment.main.offsetMinutes * 60_000)
  const mainSeconds = (local.getTime() % 86_400_000) / 1000
  const date = `${WEEKDAYS[local.getUTCDay()] ?? ''} ${two(local.getUTCDate())} ${MONTHS[local.getUTCMonth()] ?? ''}`
  const inMinute = mainSeconds % 60
  const weather = moment.weather
  const kind = weather?.kind
  const isDay = weather?.isDay ?? true
  const isWet = kind === 'rain' || kind === 'storm'

  // Rules that hold one element's timing, gathered as the scene is built.
  let rules = ''
  let serial = 0
  const timed = (delay: number, more = ''): string => {
    serial += 1
    rules += `.t${serial}{animation-delay:${(-delay).toFixed(3)}s${more}}`
    return `t${serial}`
  }

  /**
   * One window onto a strip: `cells` glyphs wide, drawn at `scale` of the big lattice. The strip rests at the glyph
   * of now (`transform`), and the animation `name`, already `elapsed` seconds into its round of `steps`, steps it on.
   */
  const reel = (href: string, name: string, elapsed: number, round: number, steps: number, x: number, y: number, scale: number, cells: number): string => {
    const width = (cells - 1) * ADVANCE + CELL_W
    const index = Math.floor((elapsed / round) * steps)
    return `<svg x="${x}" y="${y}" width="${width * scale}" height="${CELL_H * scale}" viewBox="0 0 ${width} ${CELL_H}" overflow="hidden"><g class="${name} ${timed(elapsed)}" transform="translate(0 ${-index * STEP})"><use href="#${href}"/></g></svg>`
  }

  /** HH:MM from two strips, with a colon that blinks; `scale` of the big lattice, its top-left at (x, y). */
  const clock = (secondsOfDay: number, x: number, y: number, scale: number): string => {
    const inHour = secondsOfDay % 3600
    const colonX = x + (2 * ADVANCE + PITCH / 2) * scale
    const minutesX = x + (2 * ADVANCE + 2 * PITCH) * scale
    return `${reel('hours', 'h24', secondsOfDay, 86400, 24, x, y, scale, 2)}
<path class="colon" fill="none" stroke-linecap="round" stroke-width="${17.5 * scale}" d="M${colonX} ${y + PITCH * 2.5 * scale}h0M${colonX} ${y + PITCH * 4.5 * scale}h0"/>
${reel('digits', 'm10', inHour, 3600, 6, minutesX, y, scale, 1)}
${reel('digits', 'm1', inHour % 600, 600, 10, minutesX + ADVANCE * scale, y, scale, 1)}`
  }

  // The sky: three bands with a dithered seam, deeper after dark.
  const sky = isDay ? ['#c3d2ff', '#b3c5fb', '#a3b8f6'] : ['#a9b7f0', '#9aaae8', '#8c9ce0']
  const dull = kind !== undefined && kind !== 'clear'
  const cloudBody = dull ? '#e9eeff' : '#ffffff'
  const cloudShade = dull ? '#9fb0e6' : '#c6d3fa'

  let body = ''
  let shade = ''
  CLOUD_ROWS.forEach((line, r) => {
    for (let c = 0; c < line.length; c += 1) {
      if (line[c] !== '#') continue
      const square = `M${c} ${r}h1v1h-1z`
      if (r === CLOUD_ROWS.length - 1) shade += square
      else body += square
    }
  })
  let clouds = ''
  CLOUDS.slice(0, kind === undefined ? 4 : CLOUD_COUNT[kind]).forEach(([y, scale, seconds, delay]) => {
    // At rest a cloud sits where its drift would have it now.
    const restX = Math.round((-320 + (2080 * delay) / seconds) / UNIT) * UNIT
    clouds += `<g class="cloud ${timed(delay, `;animation-duration:${seconds}s`)}" transform="translate(${restX} 0)"><g transform="translate(0 ${y}) scale(${UNIT * scale})"><path fill="${cloudBody}" d="${body}"/><path fill="${cloudShade}" d="${shade}"/></g></g>`
  })

  // The light in the sky: a sun by day, a moon and stars by night; neither under rain, snow or fog.
  let light = ''
  if (kind === undefined || kind === 'clear' || kind === 'cloudy') {
    if (isDay) {
      light = `<g transform="scale(${UNIT})"><path fill="#ffd75e" d="${disc(184, 14, 7)}"/><path fill="#fff1a8" d="${disc(184, 14, 4)}"/></g>`
    } else {
      const random = seeded(7)
      let stars = ['', '', '']
      for (let n = 0; n < 45; n += 1) {
        const x = Math.floor(random() * COLS) * UNIT
        const y = Math.floor(random() * 70) * UNIT
        stars[n % 3] += `M${x} ${y}h8v8h-8z`
      }
      stars = stars.map((d, i) => `<path class="star ${timed(i * 1.3)}" fill="#ffffff" d="${d}"/>`)
      light = `${stars.join('')}<g transform="scale(${UNIT})"><path fill="#fdfdff" d="${disc(184, 14, 6)}"/><path fill="${sky[0]}" d="${disc(187, 12, 5)}"/></g>`
    }
  }

  // What falls: two sheets each, one behind the other, every sheet drawn twice so its fall never shows a seam.
  let falling = ''
  if (isWet || kind === 'snow') {
    const random = seeded(isWet ? 11 : 23)
    for (const [count, seconds, opacity] of isWet ? ([[80, 0.9, 0.75], [60, 1.4, 0.45]] as const) : ([[60, 10, 0.95], [50, 16, 0.7]] as const)) {
      let d = ''
      for (let n = 0; n < count; n += 1) {
        const x = Math.floor(random() * COLS) * UNIT
        const y = Math.floor(random() * 125) * UNIT
        for (const top of [y, y - HEIGHT]) d += isWet ? `M${x} ${top}h4v24h-4z` : `M${x} ${top}h8v8h-8z`
      }
      falling += `<path class="fall ${timed(0, `;animation-duration:${seconds}s`)}" fill="${isWet ? '#3046b8' : '#ffffff'}" fill-opacity="${opacity}" d="${d}"/>`
    }
    if (kind === 'storm') falling += `<rect class="flash" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" opacity="0"/>`
  }
  if (kind === 'fog') {
    for (const [y, height, delay] of [[180, 40, 0], [330, 32, 9], [470, 48, 4], [610, 32, 14], [730, 40, 7]] as const) {
      falling += `<rect class="fog ${timed(delay)}" x="-120" y="${y}" width="${WIDTH + 240}" height="${height}" fill="#ffffff" fill-opacity=".5"/>`
    }
  }

  const smooth = moment.smooth ?? true
  const ease = smooth ? 'ease-in-out' : 'steps(1)'
  const style = `
.h24{animation:h24 86400s steps(24) infinite}
.m10{animation:d6 3600s steps(6) infinite}
.m1{animation:d10 600s steps(10) infinite}
.s10{animation:d6 60s steps(6) infinite}
.s1{animation:d10 10s steps(10) infinite}
.colon{animation:blink 2s ${ease} infinite}
.live{animation:live 60s steps(1) infinite}
.minute{animation:minute 60s steps(60) infinite}
.day{animation:day 86400s steps(24) infinite}
.cloud{animation:drift linear infinite${smooth ? '' : ';animation-timing-function:steps(260)'}}
.star{animation:blink 4s ${ease} infinite}
.fall{animation:fall ${smooth ? 'linear' : isWet ? 'steps(25)' : 'steps(125)'} infinite}
.fog{animation:fog 30s ${smooth ? 'ease-in-out' : 'steps(25)'} infinite alternate}
.flash{animation:flash 7s steps(1) infinite}
@keyframes h24{from{transform:translateY(0)}to{transform:translateY(-${24 * STEP}px)}}
@keyframes d10{from{transform:translateY(0)}to{transform:translateY(-${10 * STEP}px)}}
@keyframes d6{from{transform:translateY(0)}to{transform:translateY(-${6 * STEP}px)}}
@keyframes blink{50%{opacity:.25}}
@keyframes live{from,to{opacity:1}}
@keyframes minute{from{width:0}to{width:708px}}
@keyframes day{from{width:0}to{width:504px}}
@keyframes drift{from{transform:translateX(-320px)}to{transform:translateX(1760px)}}
@keyframes fall{from{transform:translate(0,0)}to{transform:translate(${isWet ? -80 : 60}px,${HEIGHT}px)}}
@keyframes fog{from{transform:translateX(-100px)}to{transform:translateX(100px)}}
@keyframes flash{0%{opacity:0}90%{opacity:.75}91%{opacity:0}93%{opacity:.5}94%{opacity:0}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}`

  const lean =
    level >= 7
      ? `.colon{animation:blink 2s steps(1) infinite}@keyframes blink{50%{opacity:.25}}`
      : `.h24{animation:h24 86400s steps(24) infinite}.m10{animation:d6 3600s steps(6) infinite}.m1{animation:d10 600s steps(10) infinite}.colon{animation:blink 2s steps(1) infinite}@keyframes h24{from{transform:translateY(0)}to{transform:translateY(-${24 * STEP}px)}}@keyframes d10{from{transform:translateY(0)}to{transform:translateY(-${10 * STEP}px)}}@keyframes d6{from{transform:translateY(0)}to{transform:translateY(-${6 * STEP}px)}}@keyframes blink{50%{opacity:.25}}`

  const hours = Array.from({ length: 24 }, (_, hour) => two(hour))
  const digits = Array.from({ length: 10 }, (_, digit) => String(digit))
  const note = weather === undefined ? 'TODAY' : `${WORDS[weather.kind]} ${Math.round(weather.temperature)}C`

  let secondLine = ''
  if (moment.second !== undefined && level < 5) {
    const secondSeconds = ((((moment.now + moment.second.offsetMinutes * 60_000) % 86_400_000) + 86_400_000) % 86_400_000) / 1000
    secondLine = `<rect x="600" y="500" width="760" height="2" fill="${REST}"/>
<path fill="none" stroke="${TEXT}" stroke-linecap="round" stroke-width="4.8" d="${dots(moment.second.label, 600, 536, 6)}"/>
<g stroke="${INK}">${clock(secondSeconds, 1195, 532, 0.3)}</g>`
  }

  const colonOnly = `<path class="colon" fill="none" stroke="${INK}" stroke-linecap="round" stroke-width="17.5" d="M875 235h0M875 279h0"/>`
  const seconds = `<g class="live" opacity="0" stroke="${PLUM}">
${reel('digits', 's10', inMinute, 60, 6, 1172, 271, 0.41, 1)}
${reel('digits', 's1', inMinute % 10, 10, 10, 1172 + ADVANCE * 0.41, 271, 0.41, 1)}
</g>`
  const progress = `<g class="live" opacity="0" fill="none" stroke-linecap="round" stroke-width="7">
<path stroke="${REST}" d="${row(60, 600, 400, 11.8)}"/>
<path stroke="${INK}" clip-path="url(#minute)" d="${row(60, 600, 400, 11.8)}"/>
</g>
<g fill="none" stroke-linecap="round" stroke-width="15">
<path stroke="${REST}" d="${row(24, 600, 450, 21)}"/>
<path stroke="${INK}" clip-path="url(#day)" d="${row(24, 600, 450, 21)}"/>
</g>`
  const tag = level > 0 ? `<path fill="none" stroke="#c8253d" stroke-linecap="round" stroke-width="13" d="${dots(`TEST ${level}`, 600, 620, 16)}"/>` : ''
  const main = `<circle cx="608" cy="131" r="8" fill="${PLUM}"/>
<path fill="none" stroke="${TEXT}" stroke-linecap="round" stroke-width="3.4" d="${dots(moment.main.label, 632, 117, 4)}"/>
<path fill="none" stroke="${TEXT}" stroke-linecap="round" stroke-width="3.4" d="${dots(date, 1360 - widthOf(date, 4), 117, 4)}"/>
${level >= 7 ? colonOnly : `<g stroke="${INK}">${clock(mainSeconds, 600, 180, 1)}</g>`}
${level >= 5 ? '' : seconds}
${level >= 4 ? '' : progress}
<path fill="none" stroke="${TEXT}" stroke-linecap="round" stroke-width="3.4" d="${dots(note, 1360 - widthOf(note, 4), 436, 4)}"/>
${secondLine}${tag}`

  // The clips' timing rules are made last, so they are in `rules` before the style block is written below.
  const minuteClip = `<rect class="minute ${timed(inMinute)}" x="594" y="388" width="${(Math.floor(inMinute) * 11.8).toFixed(1)}" height="24"/>`
  const dayClip = `<rect class="day ${timed(mainSeconds)}" x="589.5" y="434" width="${Math.floor(mainSeconds / 3600) * 21}" height="32"/>`

  const clips = level >= 4 ? '' : `<clipPath id="minute">${minuteClip}</clipPath>
<clipPath id="day">${dayClip}</clipPath>`
  const strips = level >= 7 ? '' : `${strip('hours', hours)}${strip('digits', digits)}`
  const ground =
    level >= 3
      ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${sky[1]}"/>`
      : `<g shape-rendering="crispEdges">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${sky[0]}"/>
<rect y="296" width="${WIDTH}" height="704" fill="${sky[1]}"/>
<rect y="280" width="${WIDTH}" height="16" fill="url(#seam1)"/>
<rect y="616" width="${WIDTH}" height="384" fill="${sky[2]}"/>
<rect y="600" width="${WIDTH}" height="16" fill="url(#seam2)"/>
${level >= 2 ? '' : `${light}${clouds}`}
${ridge(isDay ? '#8ba2ec' : '#7a8fdc', x => 96 - Math.round(6 * Math.sin(x / 23 + 1) + 3 * Math.sin(x / 9)))}
${ridge(isDay ? '#7189e0' : '#6177cf', x => 106 - Math.round(5 * Math.sin(x / 17 + 4) + 2 * Math.sin(x / 7 + 2)))}
${ridge(isDay ? '#5c74d2' : '#4d63bf', x => 116 - Math.round(3 * Math.sin(x / 29 + 2) + 2 * Math.sin(x / 11)))}
${level >= 2 ? '' : falling}
</g>`
  const seams =
    level >= 3
      ? ''
      : `<pattern id="seam1" width="16" height="16" patternUnits="userSpaceOnUse" fill="${sky[1]}"><rect width="8" height="8"/><rect x="8" y="8" width="8" height="8"/></pattern>
<pattern id="seam2" width="16" height="16" patternUnits="userSpaceOnUse" fill="${sky[2]}"><rect width="8" height="8"/><rect x="8" y="8" width="8" height="8"/></pattern>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${level >= 6 ? lean : style}
${level >= 7 ? '' : rules}</style><defs>
${strips}
${seams}
${clips}
</defs>
${ground}
${main}
</svg>`
}

/**
 * A test card: eight squares, each moved by one way of animating alone, under its letter. Which of them move in a
 * window says which ways that window lets a scene use. `withQuery` adds the rule that stills a scene under reduced motion.
 */
export function probeSvg(withQuery: boolean): string {
  const letters = 'ABCDEFGH'
  let tiles = ''
  const at = (i: number): readonly [number, number] => [600 + (i % 4) * 190, 300 + Math.floor(i / 4) * 220]
  const square = '<rect width="70" height="70"/>'
  const parts: readonly string[] = [
    // A: a class and a keyframes rule.
    '<rect class="pa" width="70" height="70"/>',
    // B: the same animation named in a style attribute.
    '<rect style="animation:pb 1s steps(1) infinite" width="70" height="70"/>',
    // C: SMIL, no CSS at all.
    '<rect width="70" height="70"><animate attributeName="opacity" values="1;0.1;1" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>',
    // D: a class with a negative delay.
    '<rect class="pa pd" width="70" height="70"/>',
    // E: a transform animated inside a nested svg window.
    `<svg width="100" height="70" overflow="hidden"><g class="pe">${square}</g></svg>`,
    // F: a transform animated over a use.
    '<g class="pe"><use href="#sq"/></g>',
    // G: a transform animated over a transform attribute.
    `<g class="pe" transform="translate(15 0)">${square}</g>`,
    // H: a clip whose width is animated.
    `<rect width="70" height="70" clip-path="url(#pc)"/>`,
  ]
  parts.forEach((part, i) => {
    const [x, y] = at(i)
    tiles += `<path fill="none" stroke="#1d2140" stroke-linecap="round" stroke-width="8" d="${dots(letters[i] ?? '', x, y - 110, 10)}"/><g transform="translate(${x} ${y})" fill="#c8253d">${part}</g>`
  })
  const style = `
.pa{animation:pb 1s steps(1) infinite}
.pd{animation-delay:-.5s}
.pe{animation:pm 1s steps(2) infinite}
.ph{animation:pw 1s steps(2) infinite}
@keyframes pb{50%{opacity:.1}}
@keyframes pm{from{transform:translateX(0)}to{transform:translateX(60px)}}
@keyframes pw{from{width:0}to{width:140px}}${withQuery ? '\n@media (prefers-reduced-motion: reduce){*{animation:none!important}}' : ''}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${style}</style><defs><rect id="sq" width="70" height="70"/><clipPath id="pc" clipPathUnits="objectBoundingBox"><rect class="ph" width="0" height="1"/></clipPath></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="#dfe6ff"/>
<path fill="none" stroke="#1d2140" stroke-linecap="round" stroke-width="5" d="${dots(withQuery ? 'TEST 2' : 'TEST 1', 600, 110, 6)}"/>
${tiles}
</svg>`
}
