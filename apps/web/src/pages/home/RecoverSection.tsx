import { lazy, Suspense } from "react";
import { useNearViewport } from "../../ui/nearViewport";
import { getLocale, t } from "../../i18n/locale";

/** The demo runs the table's `decide`, so its code is fetched only near the viewport. */
const RecoverDemo = lazy(() => import("./RecoverDemo"));

/** Recovering from a mistake (gm-home: "Undo runs the table's undo"). */
export function RecoverSection() {
  const [near, ref] = useNearViewport<HTMLDivElement>();
  return (
    <section className="home-section recover-section" aria-labelledby="recover-heading">
      <div className="section-copy">
        <h3 id="recover-heading">{t("home.recover.title")}</h3>
        <p>
          {t("home.recover.body")}
        </p>
      </div>
      <div ref={ref} className="recover-slot">
        {near && (
          <Suspense fallback={null}>
            {/* Keyed on the language: the demo's room is built with names in it (localization). */}
            <RecoverDemo key={getLocale()} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
