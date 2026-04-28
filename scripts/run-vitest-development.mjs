#!/usr/bin/env node

import { spawnSync } from "node:child_process"

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--conditions=development"].filter(Boolean).join(" ")

const result = spawnSync("vitest", process.argv.slice(2), {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
})

if (result.error !== undefined) {
    throw result.error
}

process.exitCode = result.status ?? 1
