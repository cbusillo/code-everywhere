import type { RequestedInput, RequestedInputAnswer, RequestedInputQuestion } from "@code-everywhere/contracts"

export type DraftMap = Record<string, string>

export const getDraftValue = (drafts: DraftMap, key: string | undefined, fallback = ""): string => {
    if (key === undefined) {
        return fallback
    }

    return drafts[key] ?? fallback
}

export const setDraftValue = (drafts: DraftMap, key: string, value: string): DraftMap => ({
    ...drafts,
    [key]: value,
})

export const getRequestedInputDefault = (question: RequestedInputQuestion | undefined): string => question?.options[0]?.value ?? ""

export const getRequestedInputDraftKey = (inputId: string, questionId: string): string => `${inputId}:${questionId}`

export const getRequestedInputAnswerValues = (drafts: DraftMap, input: RequestedInput | undefined): Record<string, string> =>
    Object.fromEntries(
        input?.questions.map((question) => [
            question.id,
            getDraftValue(drafts, getRequestedInputDraftKey(input.id, question.id), getRequestedInputDefault(question)),
        ]) ?? [],
    )

export const setRequestedInputAnswerValue = (drafts: DraftMap, inputId: string, questionId: string, value: string): DraftMap =>
    setDraftValue(drafts, getRequestedInputDraftKey(inputId, questionId), value)

export const getRequestedInputAnswers = (input: RequestedInput, values: Record<string, string>): RequestedInputAnswer[] =>
    input.questions.map((question) => ({
        questionId: question.id,
        value: values[question.id] ?? getRequestedInputDefault(question),
    }))
