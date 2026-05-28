export const STANDARD_CLEAN_MODES = ['scrub', 'dry', 'vacuum', 'inspect'] as const

export type StandardCleanMode = (typeof STANDARD_CLEAN_MODES)[number]

export const DEFAULT_CLEAN_MODE: StandardCleanMode = 'scrub'

const CLEAN_MODE_ALIASES: Record<string, StandardCleanMode> = {
  scrub: 'scrub',
  dry: 'dry',
  vacuum: 'vacuum',
  inspect: 'inspect',

  inspection: 'inspect',
  patrol: 'inspect',
  '\u5de1\u68c0': 'inspect',
  eco_inspect: 'inspect',
  inspect_eco: 'inspect',

  vac: 'vacuum',
  vacuum_only: 'vacuum',
  suction: 'vacuum',
  suction_only: 'vacuum',

  sweep: 'dry',
  sweep_dry: 'dry',
  dry_sweep: 'dry',

  wet: 'scrub',
  wash: 'scrub',
  wet_scrub: 'scrub',
  deep: 'scrub',
  deep_clean: 'scrub',
} as const

function normalizeCleanModeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function canonicalizeCleanMode(
  value: string | null | undefined,
): StandardCleanMode | null {
  const key = normalizeCleanModeKey(value)
  return key.length > 0 ? CLEAN_MODE_ALIASES[key] ?? null : null
}

export function normalizeCleanMode(
  value: string | null | undefined,
): StandardCleanMode {
  return canonicalizeCleanMode(value) ?? DEFAULT_CLEAN_MODE
}

export function normalizeCleanModeList(
  values: Array<string | null | undefined>,
) {
  const seen = new Set<StandardCleanMode>()

  return values.reduce<StandardCleanMode[]>((result, value) => {
    const normalized = canonicalizeCleanMode(value)

    if (!normalized || seen.has(normalized)) {
      return result
    }

    seen.add(normalized)
    result.push(normalized)
    return result
  }, [])
}

export const STANDARD_CLEAN_MODE_SELECT_OPTIONS = STANDARD_CLEAN_MODES.map(
  (value) => ({
    label: value,
    value,
    title: value,
  }),
)
