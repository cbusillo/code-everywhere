import { request } from "node:http"

import { describe, expect, it } from "vitest"

import { CockpitServerCliError, cockpitServerUrl, parseCockpitServerArgs, startCockpitHttpServer } from "./cli"

describe("cockpit HTTP server CLI", () => {
    it("parses defaults, env, and command-line overrides", () => {
        expect(parseCockpitServerArgs([], {})).toEqual({
            host: "127.0.0.1",
            port: 4789,
            help: false,
        })
        expect(
            parseCockpitServerArgs(["--host", "0.0.0.0", "--port=4900"], {
                CODE_EVERYWHERE_HOST: "127.0.0.1",
                CODE_EVERYWHERE_PORT: "4789",
            }),
        ).toEqual({
            host: "0.0.0.0",
            port: 4900,
            help: false,
        })
        expect(parseCockpitServerArgs(["--", "--help"], {})).toMatchObject({ help: true })
    })

    it("rejects invalid options", () => {
        expect(() => parseCockpitServerArgs(["--port", "nope"], {})).toThrow(CockpitServerCliError)
        expect(() => parseCockpitServerArgs(["--host"], {})).toThrow("--host requires a value")
        expect(() => parseCockpitServerArgs(["--host", "--port", "4900"], {})).toThrow("--host requires a value")
        expect(() => parseCockpitServerArgs(["--port", "--host", "127.0.0.1"], {})).toThrow("--port requires a value")
        expect(() => parseCockpitServerArgs(["--wat"], {})).toThrow("Unknown option: --wat")
    })

    it("formats connectable listen URLs", () => {
        expect(cockpitServerUrl("0.0.0.0", 4789)).toBe("http://127.0.0.1:4789")
        expect(cockpitServerUrl("::", 4789)).toBe("http://[::1]:4789")
        expect(cockpitServerUrl("::1", 4789)).toBe("http://[::1]:4789")
        expect(cockpitServerUrl("127.0.0.1", 4789)).toBe("http://127.0.0.1:4789")
    })

    it("starts a working local HTTP server", async () => {
        const running = await startCockpitHttpServer({ host: "127.0.0.1", port: 0 })

        try {
            const response = await sendGet(running.url, "/snapshot")

            expect(response.statusCode).toBe(200)
            expect(response.body).toMatchObject({ eventCount: 0, sessions: [] })
        } finally {
            await new Promise<void>((resolve, reject) => {
                running.server.close((error) => {
                    if (error !== undefined) {
                        reject(error)
                        return
                    }

                    resolve()
                })
            })
        }
    })
})

const sendGet = async (baseUrl: string, path: string): Promise<{ statusCode: number; body: unknown }> =>
    new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl)
        const req = request(url, { method: "GET" }, (response) => {
            const chunks: Buffer[] = []
            response.on("data", (chunk: Buffer) => chunks.push(chunk))
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode ?? 0,
                    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
                })
            })
        })

        req.on("error", reject)
        req.end()
    })
