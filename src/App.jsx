import React from "react";
import { createRoot } from "react-dom/client";
import ElevatorSimulator from "./ElevatorSimulator";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <main>
      <h1 style={{ textAlign: "center", fontFamily: "sans-serif" }}>Simulatore ascensore</h1>
      <p style={{ textAlign: "center", fontFamily: "sans-serif" }}>Chiama l’ascensore da un piano o scegli una destinazione dalla cabina.</p>
      <ElevatorSimulator />
    </main>
  </React.StrictMode>,
);
