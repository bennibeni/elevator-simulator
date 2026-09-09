import React from "react";
import { createRoot } from "react-dom/client";
import ElevatorSimulator from "./ElevatorSimulator";
import "./globals.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <main>
      <h1 style={{ textAlign: "center", fontFamily: "sans-serif" }}>
        Simulatore ascensore
      </h1>
      <p style={{ textAlign: "center", fontFamily: "sans-serif" }}>
        Chiama l’ascensore da un piano o scegli una destinazione dalla cabina.
      </p>
      <ElevatorSimulator />
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">
          &larr; All projects
        </a>
      </footer>
    </main>
  </React.StrictMode>,
);
