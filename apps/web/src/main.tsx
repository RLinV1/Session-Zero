import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The app's only typefaces (design-language: "One typeface"), self-hosted. Fontsource ships
// woff2 from npm, so there is no third-party font request and no layout shift from one.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import { App } from "./App";
import { loadAccount, whenThisDeviceSignsOut } from "./account/accountStore";
import { dropGuestChoice, forgetAccountSeats } from "./net/identity";
import { parseRoute } from "./router";
import { applyStoredLayer } from "./theme";
import { syncMotionAttribute } from "./ui/motion";
import "./styles.css";

// The stored theme, on <html> before the first render, so a light page never flashes dark.
applyStoredLayer(parseRoute(location.pathname));
// One reduced-motion switch for the stylesheet: the system setting or the in-app one.
syncMotionAttribute();

// Who is signed in, asked once (ADR 0017 C3). Seats this device holds through the account go
// when it signs out, so a shared computer keeps no way back into anyone's rooms (M4).
void loadAccount();
whenThisDeviceSignsOut(() => forgetAccountSeats());
dropGuestChoice();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
