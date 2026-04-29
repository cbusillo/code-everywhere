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

export const requestedInputNoteQuestionId = "__note"

export const getRequestedInputNoteDraftKey = (inputId: string): string => `${inputId}:note`

export const getRequestedInputAnswerValues = (drafts: DraftMap, input: RequestedInput | undefined): Record<string, string> =>
    Object.fromEntries(
        input?.questions.map((question) => [
            question.id,
            getDraftValue(drafts, getRequestedInputDraftKey(input.id, question.id), getRequestedInputDefault(question)),
        ]) ?? [],
    )

export const setRequestedInputAnswerValue = (drafts: DraftMap, inputId: string, questionId: string, value: string): DraftMap =>
    setDraftValue(drafts, getRequestedInputDraftKey(inputId, questionId), value)

export const getRequestedInputNoteValue = (drafts: DraftMap, input: RequestedInput | undefined): string =>
    getDraftValue(drafts, input === undefined ? undefined : getRequestedInputNoteDraftKey(input.id))

export const setRequestedInputNoteValue = (drafts: DraftMap, inputId: string, value: string): DraftMap =>
    setDraftValue(drafts, getRequestedInputNoteDraftKey(inputId), value)

export const getRequestedInputAnswers = (
    input: RequestedInput,
    values: Record<string, string>,
    note = "",
): RequestedInputAnswer[] => {
    const answers = input.questions.map((question) => ({
        questionId: question.id,
        value: values[question.id] ?? getRequestedInputDefault(question),
    }))
    const trimmedNote = note.trim()
    if (trimmedNote !== "") {
        answers.push({ questionId: requestedInputNoteQuestionId, value: trimmedNote })
    }
    return answers
}
