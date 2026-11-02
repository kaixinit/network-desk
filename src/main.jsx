import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./desk.css";
import "./appearance.css";
import "./observations.css";
import "./desktop.css";
import "./batch-table.css";
import "./compact.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
