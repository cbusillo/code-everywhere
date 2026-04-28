import type { Server } from "node:http"
import { env, stderr, stdout } from "node:process"
import { pathToFileURL } from "node:url"

import { createCockpitHttpServer } from "./http.js"
import { createPersistentCockpitStores } from "./persistence.js"

export type CockpitServerCliOptions = {
    host: string
    port: number
    dataFile: string | null
    help: boolean
}

export type RunningCockpitServer = {
    server: Server
    url: string
}

const defaultHost = "127.0.0.1"
const defaultPort = 4789
const defaultDataFile = ".code-everywhere/cockpit-broker.json"

export class CockpitServerCliError extends Error {}

export const formatCockpitServerHelp = (): string => `Code Everywhere cockpit HTTP server

Usage:
  pnpm cockpit:server [--host 127.0.0.1] [--port 4789] [--data-file .code-everywhere/cockpit-broker.json]

Options:
  --host <host>            Bind address. Defaults to CODE_EVERYWHERE_HOST or ${defaultHost}.
  --port <port>            Bind port. Defaults to CODE_EVERYWHERE_PORT or ${String(defaultPort)}.
  --data-file <path>       Persistence file. Defaults to CODE_EVERYWHERE_DATA_FILE or ${defaultDataFile}.
  --memory                 Disable file persistence for this run.
  -h, --help               Show this help.
`

export const parseCockpitServerArgs = (args: readonly string[], variables: NodeJS.ProcessEnv = env): CockpitServerCliOptions => {
    if (isHelpRequest(args)) {
        return {
            host: defaultHost,
            port: defaultPort,
            dataFile: defaultDataFile,
            help: true,
        }
    }

    let host = normalizeHost(variables.CODE_EVERYWHERE_HOST) ?? defaultHost
    let port: number | undefined
    let dataFile: string | null = normalizeValue(variables.CODE_EVERYWHERE_DATA_FILE) ?? defaultDataFile
    let help = false

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === "--") {
            continue
        }

        if (arg === "-h" || arg === "--help") {
            help = true
            continue
        }

        if (arg === "--host") {
            host = readOptionValue(args, index, "--host")
            index += 1
            continue
        }

        if (arg?.startsWith("--host=")) {
            host = requireNonEmptyValue(arg.slice("--host=".length), "--host")
            continue
        }

        if (arg === "--port") {
            port = parsePort(readOptionValue(args, index, "--port"), "--port") ?? defaultPort
            index += 1
            continue
        }

        if (arg?.startsWith("--port=")) {
            port = parsePort(arg.slice("--port=".length), "--port") ?? defaultPort
            continue
        }

        if (arg === "--data-file") {
            dataFile = readOptionValue(args, index, "--data-file")
            index += 1
            continue
        }

        if (arg?.startsWith("--data-file=")) {
            dataFile = requireNonEmptyValue(arg.slice("--data-file=".length), "--data-file")
            continue
        }

        if (arg === "--memory") {
            dataFile = null
            continue
        }

        throw new CockpitServerCliError(`Unknown option: ${arg ?? ""}`)
    }

    return {
        host,
        port: port ?? parsePort(variables.CODE_EVERYWHERE_PORT, "CODE_EVERYWHERE_PORT") ?? defaultPort,
        dataFile,
        help,
    }
}

const isHelpRequest = (args: readonly string[]): boolean => args.includes("-h") || args.includes("--help")

export const cockpitServerUrl = (host: string, port: number): string => {
    const connectHost = connectableHost(host)
    const urlHost = connectHost.includes(":") && !connectHost.startsWith("[") ? `[${connectHost}]` : connectHost
    return `http://${urlHost}:${String(port)}`
}

export const startCockpitHttpServer = async (
    options: Pick<CockpitServerCliOptions, "host" | "port"> & { dataFile?: string | null },
): Promise<RunningCockpitServer> => {
    const stores =
        options.dataFile === undefined || options.dataFile === null ? undefined : createPersistentCockpitStores(options.dataFile)
    const server = createCockpitHttpServer(stores)
    await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
            server.off("listening", onListening)
            reject(error)
        }
        const onListening = () => {
            server.off("error", onError)
            resolve()
        }

        server.once("error", onError)
        server.once("listening", onListening)
        server.listen(options.port, options.host)
    })

    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : options.port

    return {
        server,
        url: cockpitServerUrl(options.host, port),
    }
}

export const runCockpitServerCli = async (
    args: readonly string[] = process.argv.slice(2),
    variables: NodeJS.ProcessEnv = env,
): Promise<number> => {
    try {
        const options = parseCockpitServerArgs(args, variables)

        if (options.help) {
            stdout.write(formatCockpitServerHelp())
            return 0
        }

        const running = await startCockpitHttpServer(options)
        stdout.write(`Code Everywhere cockpit HTTP server listening at ${running.url}\n`)
        if (options.dataFile !== null) {
            stdout.write(`Persisting broker state to ${options.dataFile}\n`)
        }
        stdout.write(`Use VITE_COCKPIT_HTTP_URL=${running.url} for the web cockpit.\n`)
        return 0
    } catch (error: unknown) {
        stderr.write(`${error instanceof Error ? error.message : "Unable to start cockpit HTTP server"}\n`)
        return 1
    }
}

const normalizeHost = (host: string | undefined): string | undefined => {
    return normalizeValue(host)
}

const normalizeValue = (value: string | undefined): string | undefined => {
    const normalized = value?.trim()
    return normalized === undefined || normalized === "" ? undefined : normalized
}

const readOptionValue = (args: readonly string[], index: number, option: string): string =>
    requireNonEmptyValue(args[index + 1], option)

const requireNonEmptyValue = (value: string | undefined, option: string): string => {
    const normalized = normalizeHost(value)
    if (normalized === undefined || normalized.startsWith("-")) {
        throw new CockpitServerCliError(`${option} requires a value`)
    }

    return normalized
}

const connectableHost = (host: string): string => {
    const normalized = host.trim()

    switch (normalized) {
        case "":
        case "*":
        case "0.0.0.0":
            return "127.0.0.1"
        case "::":
        case "[::]":
            return "::1"
        default:
            return normalized
    }
}

const parsePort = (value: string | undefined, label: string): number | undefined => {
    const normalized = value?.trim()
    if (normalized === undefined || normalized === "") {
        return undefined
    }

    const port = Number(normalized)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new CockpitServerCliError(`${label} must be an integer from 0 to 65535`)
    }

    return port
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void runCockpitServerCli().then((nextExitCode) => {
        process.exitCode = nextExitCode
    })
}
