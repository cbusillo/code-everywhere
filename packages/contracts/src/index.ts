export type SessionId = string
export type SessionEpoch = string
export type TurnId = string

export type EveryCodeSession = {
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    hostLabel: string
    cwd: string
    branch: string | null
    pid: number
    model: string
    status: SessionStatus
    summary: string
    startedAt: string
    updatedAt: string
    currentTurnId: TurnId | null
}

export type SessionStatus = "running" | "idle" | "blocked" | "waiting-for-input" | "waiting-for-approval" | "ended" | "error"

export type TurnStatus = "running" | "completed" | "blocked" | "waiting-for-input" | "waiting-for-approval" | "error"

export type SessionTurn = {
    id: TurnId
    sessionId: SessionId
    title: string
    status: TurnStatus
    actor: "operator" | "assistant" | "system"
    startedAt: string
    completedAt: string | null
    summary: string
    steps: TurnStep[]
}

export type TurnStep = {
    id: string
    kind: "message" | "tool" | "status" | "diff" | "artifact" | "error"
    title: string
    detail: string
    timestamp: string
    state: "pending" | "running" | "completed" | "blocked" | "error"
}

export type PendingApproval = {
    id: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    turnId: TurnId
    title: string
    body: string
    command: string
    cwd: string
    risk: "low" | "medium" | "high"
    requestedAt: string
}

export type RequestedInput = {
    id: string
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    turnId: TurnId
    title: string
    requestedAt: string
    questions: RequestedInputQuestion[]
}

export type SessionCommand =
    | {
          kind: "reply"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          content: string
      }
    | {
          kind: "continue_autonomously" | "pause_current_turn" | "end_session" | "status_request"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
      }
    | {
          kind: "approval_decision"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          approvalId: string
          decision: "approve" | "deny"
      }
    | {
          kind: "request_user_input_response"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          turnId: TurnId
          answers: RequestedInputAnswer[]
      }

export type RequestedInputAnswer = {
    questionId: string
    value: string
}

export type CockpitEvent =
    | {
          kind: "session_seen"
          session: EveryCodeSession
      }
    | {
          kind: "session_status_changed"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          status: SessionStatus
      }
    | {
          kind: "approval_requested"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          approvalId: string
          title: string
          body: string
      }
    | {
          kind: "user_input_requested"
          sessionId: SessionId
          sessionEpoch: SessionEpoch
          turnId: TurnId
          title: string
          questions: RequestedInputQuestion[]
      }

export type RequestedInputQuestion = {
    id: string
    label: string
    prompt: string
    required: boolean
    options: RequestedInputOption[]
}

export type RequestedInputOption = {
    label: string
    value: string
    description?: string
}
