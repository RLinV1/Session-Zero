import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "../../Link";
import { t } from "../../i18n/locale";

/**
 * The page's last word, for someone running a game: the hero's own primary action, worded the
 * same, over the closing photograph (public/img/ambient/CREDITS.md). Until that picture exists the
 * band keeps its lamp-lit ground.
 */
export function ClosingBand() {
  return (
    <section className="closing-band" aria-labelledby="closing-heading">
      <div className="closing-plate" aria-hidden="true" />
      <div className="closing-copy">
        <h2 id="closing-heading">{t("home.closing.title")}</h2>
        <p>{t("home.closing.body")}</p>
        <Link href="/gm-dashboard" className="cta">
          {t("home.closing.start")}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
