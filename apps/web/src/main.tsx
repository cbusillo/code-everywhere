import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import "./styles.css"

createRoot(document.querySelector("#root") ?? document.body).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
