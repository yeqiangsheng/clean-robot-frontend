import { useEffect, useState } from 'react'

type InputCapabilities = {
  isTouchCapable: boolean
  isCoarsePointer: boolean
}

function detectInputCapabilities(): InputCapabilities {
  if (typeof window === 'undefined') {
    return {
      isTouchCapable: false,
      isCoarsePointer: false,
    }
  }

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches
  const touchCapable = coarsePointer || navigator.maxTouchPoints > 0 || 'ontouchstart' in window

  return {
    isTouchCapable: touchCapable,
    isCoarsePointer: coarsePointer,
  }
}

export function useInputCapabilities() {
  const [capabilities, setCapabilities] = useState<InputCapabilities>(
    detectInputCapabilities,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQueries = [
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(any-pointer: coarse)'),
    ]

    const handleChange = () => {
      setCapabilities(detectInputCapabilities())
    }

    handleChange()
    mediaQueries.forEach((query) => query.addEventListener('change', handleChange))

    return () => {
      mediaQueries.forEach((query) =>
        query.removeEventListener('change', handleChange),
      )
    }
  }, [])

  return capabilities
}
