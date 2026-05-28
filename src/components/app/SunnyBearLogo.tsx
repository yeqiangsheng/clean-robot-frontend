type SunnyBearLogoProps = {
  compact?: boolean
}

export function SunnyBearLogo({ compact = false }: SunnyBearLogoProps) {
  return (
    <div
      className={`sunny-bear-logo ${compact ? 'is-compact' : ''}`}
      aria-label="SUNNY BAER"
    >
      <div className="sunny-bear-logo-row">
        <span className="sunny-bear-wordmark">SUNNY BAER</span>
        <span className="sunny-bear-symbol" aria-hidden="true">
          <span />
          <span />
        </span>
      </div>
      {!compact ? <span className="sunny-bear-cn">{'\u821c\u5b87\u8d1d\u5c14'}</span> : null}
    </div>
  )
}
