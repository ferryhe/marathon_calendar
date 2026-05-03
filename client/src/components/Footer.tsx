import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-secondary/20 mt-8" data-testid="footer">
      <div className="max-w-2xl mx-auto px-4 py-6 text-xs text-muted-foreground space-y-2">
        <p data-testid="text-footer-disclaimer">{t("footer.disclaimer")}</p>
        <div className="flex items-center justify-between">
          <span data-testid="text-footer-copyright">{t("footer.copyright", { year })}</span>
          <Link
            href="/about"
            className="underline-offset-2 hover:underline hover:text-foreground"
            data-testid="link-footer-about"
          >
            {t("footer.about")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
