export interface TaskFinishBehaviorState {
  returnToDockOnFinish?: boolean | null
  repeatAfterFullCharge?: boolean | null
}

export interface NormalizedTaskFinishBehavior {
  returnToDockOnFinish: boolean
  repeatAfterFullCharge: boolean
}

export function normalizeTaskFinishBehavior(
  state?: TaskFinishBehaviorState | null,
): NormalizedTaskFinishBehavior {
  const repeatAfterFullCharge = Boolean(state?.repeatAfterFullCharge)
  const returnToDockOnFinish = repeatAfterFullCharge
    ? true
    : Boolean(state?.returnToDockOnFinish)

  return {
    returnToDockOnFinish,
    repeatAfterFullCharge,
  }
}
