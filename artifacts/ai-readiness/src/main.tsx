import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// In production the API lives on a separate origin (e.g. Railway).
// VITE_API_URL is set in Vercel env vars → points to the deployed API server.
// In local dev it is left unset and the Vite proxy handles /api/* → localhost:4000.
const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) setBaseUrl(apiUrl);

createRoot(document.getElementById("root")!).render(<App />);
