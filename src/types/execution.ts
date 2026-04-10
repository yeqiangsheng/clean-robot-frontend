export type ExecutionCommandName =
  | 'START'
  | 'PAUSE'
  | 'CONTINUE'
  | 'STOP'
  | 'RETURN'

export interface ExecutionCommandResult {
  success: boolean
  message: string
  command: ExecutionCommandName
  taskId: number
  raw: Record<string, unknown>
}
