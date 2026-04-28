import type { RequestedInput } from "@code-everywhere/contracts"

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

export const getRequestedInputDefault = (input: RequestedInput | undefined): string => input?.questions[0]?.options[0]?.value ?? ""
