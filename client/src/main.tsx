import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const mq = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}
applyTheme(mq.matches);
mq.addEventListener("change", (e) => applyTheme(e.matches));

createRoot(document.getElementById("root")!).render(<App />);
