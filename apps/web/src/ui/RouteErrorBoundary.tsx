import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n/locale";
import { Link } from "../Link";

/**
 * Catches a render error in one page (room-error-recovery), so one bad value shows a way back
 * instead of unmounting the whole app. Keyed by the route where it is used: navigating away,
 * Back included, mounts a fresh boundary, so the next page renders without a reload.
 */
export class RouteErrorBoundary extends Component<{ room: boolean; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // The details go to the console only; the screen names no error and no room content.
    console.error("[vtt] a page failed to render", error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <FailureScreen room={this.props.room} /> : this.props.children;
  }
}

function FailureScreen({ room }: { room: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="centered">
      <div className="card" role="alert">
        <h1 ref={heading} tabIndex={-1}>{t(room ? "crash.roomTitle" : "crash.pageTitle")}</h1>
        <p className="muted">{t("crash.body")}</p>
        <div className="row">
          <button type="button" className="primary" onClick={() => location.reload()}>{t("room.reload")}</button>
          <Link href="/">{t("crash.home")}</Link>
        </div>
      </div>
    </main>
  );
}
