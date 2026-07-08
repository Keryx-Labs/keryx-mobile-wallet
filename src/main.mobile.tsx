// Mobile entry point. Renders the Capacitor/React mobile shell. The desktop `main.tsx`/`App.tsx`
// remain in the tree as the reused reference but are not the mobile build's entry.
import React from "react";
import ReactDOM from "react-dom/client";
import { MobileApp } from "./mobile/ui/MobileApp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
);
