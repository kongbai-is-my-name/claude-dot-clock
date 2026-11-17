import type { EngineInterface, Register } from 'claude-code'

import { canPrint, dotGlyphSvg, probeSvg } from './scene'
import type { Place, Weather } from './scene'

const PLUGIN = 'dot-glyph'
const BACKDROP = 'dot-glyph'
const COMMAND = 'dot-glyph'
// Kept across sessions: present and true once the person turned the theme off.
const OFF_KEY = 'off'
// Kept across sessions: the cities and the glass the person chose.
const CONFIG_KEY = 'config'

// The scene carries the time it was built at and keeps time by itself from there; a redraw now and then
// brings a new date in and mends any drift.
// The scene keeps time by itself; a redraw every half hour brings a new date in and mends any drift. Each redraw
// swaps the picture, which shows as a blink, and rebuilds the scene, so they are kept rare.
const REDRAW_MS = 30 * 60_000
let redraw: { cancel(): void } | undefined
// What the store holds, read at the session's start and after each change, so the hook that draws waits on nothing.
let config: Config = {}
// The test card shown in place of the scene: 1 without the reduced-motion rule, 2 with it; absent, the scene.
let probe: 1 | 2 | undefined
// A walk through the scene's test levels, one every ten seconds: the level shown now, and the timer that steps it.
let scan: number | undefined
let scanTimer: { cancel(): void } | undefined
// THE SCENE IS ANSWERED AS THE SAME STRING until this mod means it to change: a window asks for the drawing more often
// than the mod redraws, and a string that differed at every ask (the time is in it) gave it a new picture each time,
// which never got to move. Kept under what it was built from; dropped by the three-minute redraw.
let drawn: { from: string; svg: string } | undefined
// The weather over the big clock's city, asked for every quarter of an hour.
const WEATHER_MS = 15 * 60_000
let weatherTimer: { cancel(): void } | undefined
let weather: { label: string; at: number; value: Weather } | undefined
// Milliseconds to add to this machine's clock to agree with the network: read off the weather answer's own Date
// header, so the time costs no request of its own. Zero until a fetch finds the machine's clock off.
let clockOffset = 0

/** The time now, by the network where a fetch has corrected the machine's clock. */
function nowMs(): number {
  return Date.now() + clockOffset
}

/** A city as it is kept: by an IANA zone, or by a fixed offset from UTC in minutes. */
type City = { label: string; zone?: string; offset?: number }

type Config = {
  /** The big clock's city; `null`, this machine's own clock; absent, Hefei. */
  main?: City | null
  /** The small line's city; `null`, no line; absent, Hefei. */
  second?: City | null
  /** How opaque the pale glass over the scene is, 0 to 100; absent, 25. */
  glass?: number
  /** How the sky moves: `smooth` glides, `light` steps a pixel at a time and costs less; absent, smooth. */
  motion?: 'smooth' | 'light'
}

// What a session shows before any choice is kept: the choices this mod's person made.
const DEFAULT_MAIN: City = { label: 'HEFEI', zone: 'Asia/Shanghai', offset: 480 }
const DEFAULT_SECOND: City = { label: 'LOS ANGELES', zone: 'America/Los_Angeles', offset: -480 }
const DEFAULT_GLASS = 0

// Names a person may type, in Chinese or in English with no spaces, and the city each means.
// `offset` is the zone's standard time, used only where the zone itself cannot be asked.
const CITIES: Record<string, City> = {}
const KNOWN: readonly (readonly [string, string, string, number])[] = [
  ['合肥 hefei', 'HEFEI', 'Asia/Shanghai', 480],
  ['北京 beijing', 'BEIJING', 'Asia/Shanghai', 480],
  ['上海 shanghai', 'SHANGHAI', 'Asia/Shanghai', 480],
  ['深圳 shenzhen', 'SHENZHEN', 'Asia/Shanghai', 480],
  ['广州 guangzhou', 'GUANGZHOU', 'Asia/Shanghai', 480],
  ['杭州 hangzhou', 'HANGZHOU', 'Asia/Shanghai', 480],
  ['成都 chengdu', 'CHENGDU', 'Asia/Shanghai', 480],
  ['香港 hongkong', 'HONG KONG', 'Asia/Hong_Kong', 480],
  ['台北 taipei', 'TAIPEI', 'Asia/Taipei', 480],
  ['东京 tokyo', 'TOKYO', 'Asia/Tokyo', 540],
  ['首尔 seoul', 'SEOUL', 'Asia/Seoul', 540],
  ['新加坡 singapore', 'SINGAPORE', 'Asia/Singapore', 480],
  ['悉尼 sydney', 'SYDNEY', 'Australia/Sydney', 600],
  ['伦敦 london', 'LONDON', 'Europe/London', 0],
  ['巴黎 paris', 'PARIS', 'Europe/Paris', 60],
  ['柏林 berlin', 'BERLIN', 'Europe/Berlin', 60],
  ['纽约 newyork', 'NEW YORK', 'America/New_York', -300],
  ['多伦多 toronto', 'TORONTO', 'America/Toronto', -300],
  ['芝加哥 chicago', 'CHICAGO', 'America/Chicago', -360],
  ['洛杉矶 losangeles', 'LOS ANGELES', 'America/Los_Angeles', -480],
  ['旧金山 sanfrancisco', 'SAN FRANCISCO', 'America/Los_Angeles', -480],
  ['西雅图 seattle', 'SEATTLE', 'America/Los_Angeles', -480],
  ['温哥华 vancouver', 'VANCOUVER', 'America/Vancouver', -480],
]
for (const [names, label, zone, offset] of KNOWN) {
  for (const name of names.split(' ')) CITIES[name] = { label, zone, offset }
}

// Where each listed city is, by its label: latitude and longitude of the city itself, for its weather.
const WHERE: Record<string, readonly [number, number]> = {
  'HEFEI': [31.82, 117.23],
  'BEIJING': [39.9, 116.4],
  'SHANGHAI': [31.23, 121.47],
  'SHENZHEN': [22.54, 114.06],
  'GUANGZHOU': [23.13, 113.26],
  'HANGZHOU': [30.27, 120.15],
  'CHENGDU': [30.57, 104.07],
  'HONG KONG': [22.32, 114.17],
  'TAIPEI': [25.03, 121.57],
  'TOKYO': [35.68, 139.69],
  'SEOUL': [37.57, 126.98],
  'SINGAPORE': [1.35, 103.82],
  'SYDNEY': [-33.87, 151.21],
  'LONDON': [51.51, -0.13],
  'PARIS': [48.86, 2.35],
  'BERLIN': [52.52, 13.4],
  'NEW YORK': [40.71, -74.01],
  'TORONTO': [43.65, -79.38],
  'CHICAGO': [41.88, -87.63],
  'LOS ANGELES': [34.05, -118.24],
  'SAN FRANCISCO': [37.77, -122.42],
  'SEATTLE': [47.61, -122.33],
  'VANCOUVER': [49.28, -123.12],
}

/** Minutes to add to UTC for the wall clock of `zone` at `now`; undefined where the zone cannot be asked. */
function zoneOffset(zone: string, now: number): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(now))
    const of = (type: string): number => Number(parts.find(part => part.type === type)?.value ?? NaN)
    const wall = Date.UTC(of('year'), of('month') - 1, of('day'), of('hour'), of('minute'), of('second'))

    return Number.isFinite(wall) ? Math.round((wall - now) / 60_000) : undefined
  } catch {
    return undefined
  }
}

function placeOf(city: City, now: number): Place {
  const asked = city.zone === undefined ? undefined : zoneOffset(city.zone, now)

  return { label: city.label, offsetMinutes: asked ?? city.offset ?? 0 }
}

/**
 * Reads what follows `city`: a known name, or a label and then a zone (`Asia/Tokyo`) or an offset (`UTC+9`, `UTC-3:30`).
 * Answers the city, or a sentence saying why not.
 */
function cityOf(words: readonly string[]): City | string {
  const known = CITIES[words.join('').toLowerCase()]
  if (known !== undefined) return known

  const last = words.at(-1) ?? ''
  const label = words.slice(0, -1).join(' ').toUpperCase()
  if (words.length < 2 || label === '') {
    return 'That city is not on the list. Give a label and a zone, as in: /dot-glyph city KYOTO Asia/Tokyo, or /dot-glyph city HOME UTC+8.'
  }
  if (!canPrint(label) || label.length > 16) {
    return 'The label is printed in dot-matrix letters: up to 16 of A to Z, 0 to 9 and spaces.'
  }

  const fixed = /^(?:UTC|GMT)([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(last)
  if (fixed !== null) {
    const minutes = Number(fixed[2]) * 60 + Number(fixed[3] ?? 0)

    return { label, offset: fixed[1] === '-' ? -minutes : minutes }
  }
  if (last.includes('/') && zoneOffset(last, Date.now()) !== undefined) {
    return { label, zone: last }
  }

  return `"${last}" is not a zone this clock knows. Use one like Asia/Tokyo, or an offset like UTC+9.`
}

/** The weather service's code for the sky (WMO), as one of the six skies the scene draws. */
function kindOf(code: number): Weather['kind'] {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51) return 'rain'
  if (code === 45 || code === 48) return 'fog'

  return code >= 2 ? 'cloudy' : 'clear'
}

/**
 * Asks the weather over the big clock's city and redraws. Only a listed city has weather: its coordinates are
 * the one thing sent, to open-meteo.com. A clock on this machine's own time, or on a place given by a zone, asks nothing.
 */
async function askWeather($: EngineInterface): Promise<void> {
  try {
    const label = config.main === null ? undefined : (config.main ?? DEFAULT_MAIN).label
    const where = label === undefined ? undefined : WHERE[label]

    if (label === undefined || where === undefined) {
      weather = undefined

      return
    }

    const sent = Date.now()
    const answer = await $.http.fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${where[0]}&longitude=${where[1]}&current=temperature_2m,weather_code,is_day`,
    )
    const got = Date.now()
    if (!answer.ok) return

    // The header names the whole second the answer was made in; the answer then took half the round trip to
    // arrive. So the machine's clock is corrected only where it is off by more than a second and a half.
    const said = Date.parse(answer.headers['date'] ?? '')
    if (Number.isFinite(said)) {
      const off = said + 500 + (got - sent) / 2 - got
      const corrected = Math.abs(off) > 1500 ? Math.round(off) : 0
      if (Math.abs(corrected - clockOffset) > 1000) {
        clockOffset = corrected
        drawn = undefined
        $.ui.invalidate('ui.render')
      }
    }

    const current = (JSON.parse(answer.text) as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } }).current
    if (typeof current?.temperature_2m !== 'number' || typeof current.weather_code !== 'number') return

    const value: Weather = { kind: kindOf(current.weather_code), isDay: current.is_day !== 0, temperature: Math.round(current.temperature_2m) }
    const was = weather?.label === label ? weather.value : undefined
    weather = { label, at: Date.now(), value }

    // Only a sky that changed is worth a redraw.
    if (was === undefined || was.kind !== value.kind || was.isDay !== value.isDay || was.temperature !== value.temperature) {
      $.ui.invalidate('ui.render')
    }
  } catch {
    // No weather is no fault: the scene draws a plain day.
  }
}

async function configOf($: EngineInterface): Promise<Config> {
  const kept = await $.store.get(CONFIG_KEY)

  return typeof kept === 'object' && kept !== null ? (kept as Config) : {}
}

// What the last set of the theme came to: nothing yet, drawn by a window, or standing with no window to draw it.
// A mod installed while a session runs is loaded with no session start to set it, and a desktop window joins a new
// session only around its first message: so the theme is set again when a window joins and at a prompt until a
// set is drawn.
let shown: 'drawn' | 'undrawn' | undefined

/** Sets the backdrop: pale glass with no blur, so the pixels stay sharp under the panels. */
async function show($: EngineInterface): Promise<string> {
  const glass = config.glass ?? DEFAULT_GLASS
  const set = await $.theme.set({
    backdrop: { scene: BACKDROP, glass: { blur: 0, tint: '#eef2ff', opacity: glass / 100 } },
    overrideColorScheme: 'light',
  })
  $.ui.invalidate('ui.render')
  shown = set.isDrawn ? 'drawn' : 'undrawn'

  return set.isDrawn ? 'Dot Glyph is on.' : `Dot Glyph is on, but nothing draws it now: ${set.reason}`
}

const HELP = [
  'Usage:',
  '  /dot-glyph on | off',
  '  /dot-glyph city <name>            the big clock: 合肥, tokyo, newyork ... or "local"; a listed city also brings its weather',
  '  /dot-glyph city <LABEL> <zone>    any place: KYOTO Asia/Tokyo, or HOME UTC+8',
  '  /dot-glyph city2 <name> | off     the small line under it',
  '  /dot-glyph glass <0-100>          how much the panels veil the scene (lower shows more)',
  '  /dot-glyph motion smooth | light  clouds and rain glide, or step a pixel at a time (lighter on the machine)',
].join('\n')

/** Sets the theme again, unless the person turned it off; quiet about any fault. */
async function showAgain($: EngineInterface): Promise<void> {
  try {
    config = await configOf($)
    if ((await $.store.get(OFF_KEY)) !== true) await show($)
  } catch {
    // A theme that cannot be set must not cost the person their prompt or their window.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'A dot-matrix clock on a pixel sky that follows the weather of the city, behind the chat: on, off, city <name>, city2 <name>, glass <0-100>.',
      })

      config = await configOf($)

      if ((await $.store.get(OFF_KEY)) !== true) {
        await show($)
      }

      redraw?.cancel()
      redraw = $.clock.every(REDRAW_MS, () => {
        drawn = undefined
        $.ui.invalidate('ui.render')
      })
      weatherTimer?.cancel()
      weatherTimer = $.clock.every(WEATHER_MS, () => void askWeather($))
      void askWeather($)
    } catch (error) {
      // A theme that cannot be set must not cost the session its start.
      void $.ui.toast(`dot-glyph: ${String(error)}`)
    }

    return next(e)
  })

  // A desktop window joined: it draws the theme set from here on, so it is set once more for it.
  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    await showAgain($)

    return next(e)
  })

  // A turn's start: sets the theme where no window has drawn it yet. It always passes the prompt on.
  on('prompt.submit', async ($, e, next) => {
    if (shown !== 'drawn') await showAgain($)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(word => word !== '')
    let verb = (words[0] ?? 'on').toLowerCase()
    let rest = words.slice(1)

    // "city city2 tokyo" means the second line: the later word says which.
    while (rest[0] !== undefined && /^city2?$/i.test(rest[0])) {
      verb = rest[0].toLowerCase()
      rest = rest.slice(1)
    }

    if (verb === 'off') {
      await $.store.set(OFF_KEY, true)
      await $.theme.clear()

      return { text: 'Dot Glyph is off.' }
    }

    if (verb === 'on') {
      await $.store.delete(OFF_KEY)

      return { text: await show($) }
    }

    config = await configOf($)

    if (verb === 'city' || verb === 'city2') {
      const isMain = verb === 'city'
      const word = rest.join('').toLowerCase()
      let said: string

      if (rest.length === 0) {
        return { text: HELP }
      }

      if (isMain && word === 'local') {
        config.main = null
        said = 'The big clock shows this machine\'s own time.'
      } else if (!isMain && word === 'off') {
        config.second = null
        said = 'The second line is off.'
      } else {
        const city = cityOf(rest)
        if (typeof city === 'string') return { text: city }
        if (isMain) config.main = city
        else config.second = city
        said = `${isMain ? 'The big clock' : 'The second line'} shows ${city.label}.`
      }

      await $.store.set(CONFIG_KEY, config)
      if (isMain) void askWeather($)
      // A city is asked for to be seen: the theme is set again, unless the person turned it off.
      const state = (await $.store.get(OFF_KEY)) === true ? ' Dot Glyph is off: /dot-glyph on shows it.' : ` ${await show($)}`

      return { text: said + state }
    }

    if (verb === 'motion') {
      if (rest[0] !== 'smooth' && rest[0] !== 'light') {
        return { text: 'Say which: /dot-glyph motion smooth (clouds and rain glide), or /dot-glyph motion light (they step, which costs less).' }
      }

      config = { ...config, motion: rest[0] }
      await $.store.set(CONFIG_KEY, config)
      drawn = undefined
      $.ui.invalidate('ui.render')

      return { text: `The sky moves in the ${rest[0]} way.` }
    }

    if (verb === 'glass') {
      const value = Number(rest[0])
      if (rest[0] === undefined || !Number.isFinite(value) || value < 0 || value > 100) {
        return { text: 'Give a number from 0 (the scene bare) to 100 (the scene hidden), as in: /dot-glyph glass 30.' }
      }

      config = { ...config, glass: Math.round(value) }
      await $.store.set(CONFIG_KEY, config)
      await $.store.delete(OFF_KEY)
      await show($)

      return { text: `The glass is at ${Math.round(value)}.` }
    }

    if (verb === 'probe' && rest[0] === 'scan') {
      scanTimer?.cancel()
      scan = 1
      drawn = undefined
      $.ui.invalidate('ui.render')
      scanTimer = $.clock.every(10_000, () => {
        scan = scan === undefined || scan >= 7 ? undefined : scan + 1
        if (scan === undefined) scanTimer?.cancel()
        drawn = undefined
        $.ui.invalidate('ui.render')
      })

      return { text: 'Seven test pictures follow, ten seconds each, numbered TEST 1 to TEST 7 in red. Note in which of them the colon of the clock blinks.' }
    }

    if (verb === 'probe') {
      probe = rest[0] === 'off' ? undefined : rest[0] === '2' ? 2 : 1
      $.ui.invalidate('ui.render')

      return { text: probe === undefined ? 'The scene is back.' : `Test card ${probe} is up: say which of the squares A to H move. /dot-glyph probe off brings the scene back.` }
    }

    return { text: HELP }
  })

  // Not async, and it waits on nothing: it answers the drawing at once, as a scene that never changes would.
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    // Another mod's backdrop is its own to draw, and only the desktop window has `Svg` behind the chat.
    if (e.props.plugin !== PLUGIN || e.props.scene !== BACKDROP || e.surface !== 'desktop') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    if (probe !== undefined) {
      return <Svg isInteractive alt="A test card of eight squares" source={probeSvg(probe === 2)} />
    }

    const now = new Date(nowMs())
    const main: Place =
      config.main === null
        ? { label: 'LOCAL', offsetMinutes: -now.getTimezoneOffset() }
        : placeOf(config.main ?? DEFAULT_MAIN, now.getTime())
    const second = config.second === null ? undefined : placeOf(config.second ?? DEFAULT_SECOND, now.getTime())
    // Weather is drawn only while it is the big clock's own city's, and no older than an hour.
    const sky = weather !== undefined && weather.label === main.label && Date.now() - weather.at < 3_600_000 ? weather.value : undefined
    const smooth = config.motion !== 'light'
    const from = JSON.stringify([main, second?.label, second?.offsetMinutes, sky, scan, smooth])
    if (drawn?.from !== from) {
      drawn = { from, svg: dotGlyphSvg({ now: now.getTime(), main, second, weather: sky, smooth }, scan ?? 0) }
    }
    const scene = drawn.svg

    return <Svg isInteractive alt="A dot-matrix clock on a pixel-art sky showing the city's weather, with the date and the day's progress" source={scene} />
  })
}
