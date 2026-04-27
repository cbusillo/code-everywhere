export type SessionId = string
export type SessionEpoch = string

export type EveryCodeSession = {
    sessionId: SessionId
    sessionEpoch: SessionEpoch
    hostLabel: string
    cwd: string
    branch: string | null
    pid: number
    status: SessionStatus
}

export type SessionStatus = "connected" | "running" | "waiting_for_input" | "waiting_for_approval" | "idle" | "ended" | "error"

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
          turnId: string
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
          turnId: string
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
