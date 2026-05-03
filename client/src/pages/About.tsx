import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export default function About() {
  const { t } = useTranslation();

  const sources = t("about.sources.list", { returnObjects: true }) as string[];
  const items = t("about.disclaimer.items", { returnObjects: true }) as string[];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/80 border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-about-back"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("about.back")}
          </Link>
          <h1 className="text-base font-semibold ml-2" data-testid="text-about-title">
            {t("about.title")}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex-1 w-full">
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section data-testid="section-about-intro">
            <h2 className="text-lg font-semibold mb-2">{t("about.intro.heading")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("about.intro.body")}</p>
          </section>

          <section data-testid="section-about-sources">
            <h2 className="text-lg font-semibold mb-2">{t("about.sources.heading")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              {t("about.sources.body")}
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {Array.isArray(sources) &&
                sources.map((line, i) => (
                  <li key={i} data-testid={`text-source-${i}`}>
                    {line}
                  </li>
                ))}
            </ul>
          </section>

          <section data-testid="section-about-disclaimer">
            <h2 className="text-lg font-semibold mb-2">{t("about.disclaimer.heading")}</h2>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {Array.isArray(items) &&
                items.map((line, i) => (
                  <li key={i} data-testid={`text-disclaimer-${i}`}>
                    {line}
                  </li>
                ))}
            </ul>
          </section>

          <section data-testid="section-about-takedown">
            <h2 className="text-lg font-semibold mb-2">{t("about.takedown.heading")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("about.takedown.body")}
            </p>
          </section>
        </article>
      </main>

      <Footer />
    </div>
  );
}
