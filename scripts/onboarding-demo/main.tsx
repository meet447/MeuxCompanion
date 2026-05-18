import React from "react";
import ReactDOM from "react-dom/client";
import { Onboarding } from "../../src/components/Onboarding";
import "./onboarding.css";
import "../../src/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Onboarding onComplete={() => undefined} />
  </React.StrictMode>,
);
