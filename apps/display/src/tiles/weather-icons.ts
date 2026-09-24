// Line icons for WMO weather codes, drawn on a 64×64 grid. Colours come from CSS (.wi-*), so the
// icons follow the theme; clouds are filled with the tile background to hide what lies behind them.

export type WeatherIcon =
  | 'clearDay'
  | 'clearNight'
  | 'partlyDay'
  | 'partlyNight'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'sleet'
  | 'snow'
  | 'thunder';

/** Icon for a WMO code; only the clear and partly cloudy icons have night variants. */
export function weatherIcon(code: number | null, isDay: boolean): WeatherIcon {
  if (code === null) return 'cloudy';
  if (code <= 1) return isDay ? 'clearDay' : 'clearNight';
  if (code === 2) return isDay ? 'partlyDay' : 'partlyNight';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

interface Part {
  cls: 'sun' | 'moon' | 'cloud' | 'water' | 'snow' | 'bolt' | 'fog';
  d: string;
  transform?: string;
}

const SUN = 'M42 32a10 10 0 1 1-20 0a10 10 0 1 1 20 0z';
const RAYS = 'M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4.2 4.2M44.8 44.8l4.2 4.2M15 49l4.2-4.2M44.8 19.2l4.2-4.2';
const MOON = 'M38 10a22 22 0 1 0 16 34a18 18 0 0 1-16-34z';
const CLOUD = 'M18 46h28a9 9 0 0 0 0-18a12 12 0 0 0-23-3a10.5 10.5 0 0 0-5 21z';
/** Cloud moved up to make room for precipitation. */
const HIGH = 'translate(0 -8)';
/** Small sun or moon behind a cloud, top left. */
const BEHIND = 'translate(4 2) scale(0.6)';
const FRONT = 'translate(8 8) scale(0.88)';

function flake(x: number, y: number): string {
  return `M${x} ${y - 4}v8M${x - 3.5} ${y - 2}l7 4M${x - 3.5} ${y + 2}l7-4`;
}

const ICONS: Record<WeatherIcon, Part[]> = {
  clearDay: [
    { cls: 'sun', d: SUN },
    { cls: 'sun', d: RAYS },
  ],
  clearNight: [{ cls: 'moon', d: MOON }],
  partlyDay: [
    { cls: 'sun', d: SUN, transform: BEHIND },
    { cls: 'sun', d: RAYS, transform: BEHIND },
    { cls: 'cloud', d: CLOUD, transform: FRONT },
  ],
  partlyNight: [
    { cls: 'moon', d: MOON, transform: BEHIND },
    { cls: 'cloud', d: CLOUD, transform: FRONT },
  ],
  cloudy: [{ cls: 'cloud', d: CLOUD }],
  fog: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'fog', d: 'M12 46h40M16 52h32M20 58h24' },
  ],
  drizzle: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'water', d: 'M24 46l-1 3M34 46l-1 3M44 46l-1 3M29 54l-1 3M39 54l-1 3' },
  ],
  rain: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'water', d: 'M24 44l-3 9M34 44l-3 9M44 44l-3 9M29 52l-2 6M39 52l-2 6' },
  ],
  sleet: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'water', d: 'M26 44l-3 9M42 44l-3 9' },
    { cls: 'snow', d: flake(33, 53) },
  ],
  snow: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'snow', d: flake(24, 48) + flake(42, 48) + flake(33, 56) },
  ],
  thunder: [
    { cls: 'cloud', d: CLOUD, transform: HIGH },
    { cls: 'bolt', d: 'M35 40l-7 10h8l-6 10' },
    { cls: 'water', d: 'M22 44l-2 6M46 44l-2 6' },
  ],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A new `<svg>` element for the icon; sized by CSS. */
export function createWeatherIcon(icon: WeatherIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', `wi wi-${icon}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const part of ICONS[icon]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', part.d);
    path.setAttribute('class', `wi-${part.cls}`);
    if (part.transform) path.setAttribute('transform', part.transform);
    svg.appendChild(path);
  }
  return svg;
}
