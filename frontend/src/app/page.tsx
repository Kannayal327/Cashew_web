import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Leaf,
  Sprout,
  PackageCheck,
  ShieldCheck,
  Check,
  Quote,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catalog } from "@/components/catalog";
import { getProducts } from "@/lib/catalog";
import { Reviews } from "@/components/reviews";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await getProducts();
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="little-line" /> FROM ONE ORIGIN. FOR YOUR
              EVERYDAY.
            </span>
            <h1>
              Goodness,
              <br />
              closer to
              <br />
              <em>its roots.</em>
              <svg
                className="hero-doodle"
                viewBox="0 0 120 30"
                aria-hidden="true"
              >
                <path d="M5 18Q60 2 113 12M14 26Q61 12 105 20" />
              </svg>
            </h1>
            <p>
              Beautifully simple cashews, straight from the source. A little
              care in every harvest. A little joy in every handful.
            </p>
            <div className="hero-buttons">
              <Button asChild>
                <Link href="/shop">
                  Find your handful <ArrowUpRight size={19} />
                </Link>
              </Button>
              <Link href="#our-story" className="hero-story-link">
                Meet our roots <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-benefits">
              <span>
                <Sprout size={16} /> Single-origin goodness
              </span>
              <span>
                <PackageCheck size={16} /> Thoughtfully packed
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo">
              <Image
                src="/images/cashews-hero.png"
                alt="A ceramic bowl brimming with creamy whole cashews on natural linen"
                fill
                priority
                sizes="(max-width: 800px) 100vw, 55vw"
              />
            </div>
            <div className="hero-stamp">
              <Leaf size={24} strokeWidth={1.4} />
              <span>
                A LITTLE
                <br />
                CLOSER TO
                <br />
                <strong>NATURE.</strong>
              </span>
            </div>
            <div className="hero-photo-note">
              <span className="photo-note-dot" /> Simple ingredients. Endless
              little moments.
            </div>
            <span className="image-disclosure">Illustrative image</span>
          </div>
        </div>
        <div className="hero-caption container">
          <span>THE GOOD KIND OF SIMPLE.</span>
          <span>For slow mornings, shared tables & everything in between.</span>
          <span className="scroll-cue">SCROLL TO EXPLORE ↓</span>
        </div>
      </section>
      <div className="values-strip">
        <div className="container">
          <span>
            <Leaf size={19} /> A single-origin story
          </span>
          <span>
            <Check size={19} /> A grade for every occasion
          </span>
          <span>
            <ShieldCheck size={19} /> Secure checkout
          </span>
          <span>
            <Truck size={19} /> Delivery to your doorstep
          </span>
        </div>
      </div>
      <Catalog products={products} />
      <div className="container shop-all-row">
        <Button asChild variant="outline">
          <Link href="/shop">
            Explore the whole collection <ArrowRight size={17} />
          </Link>
        </Button>
        <span>Good things come in all sizes.</span>
      </div>
      <section id="our-story" className="story-section section">
        <div className="container story-grid">
          <div className="story-art">
            <Image
              src="/images/cashews-hero.png"
              alt="Whole cashews with their natural golden colour and texture"
              fill
              sizes="(max-width: 800px) 90vw, 45vw"
            />
            <span className="story-image-label">
              A closer look at the good stuff.
            </span>
          </div>
          <div className="story-copy">
            <span className="eyebrow">LESS DISTANCE. MORE CONNECTION.</span>
            <h2>
              Every handful
              <br />
              has a beginning.
            </h2>
            <p className="story-lead">Ours begins at the farm.</p>
            <p>
              FarmDirect Cashews is built around a simple idea: knowing where
              your food begins should be part of enjoying it. One origin, clear
              grades, and a collection made for everyday life.
            </p>
            <p>
              From the kernels you keep on your desk to the gift you take to
              someone’s home, we want the connection to the source to stay
              close.
            </p>
            {process.env.NEXT_PUBLIC_ORIGIN_NAME && (
              <div className="origin-card">
                <Sprout size={23} />
                <div>
                  <span>OUR SINGLE ORIGIN</span>
                  <strong>{process.env.NEXT_PUBLIC_ORIGIN_NAME}</strong>
                </div>
              </div>
            )}
            <Link href="#grade-guide" className="text-link">
              Get to know your cashews <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section id="grade-guide" className="grade-section section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A LITTLE CASHEW KNOW-HOW</span>
              <h2>
                Same goodness.
                <br />
                Different personalities.
              </h2>
            </div>
            <p>
              The number tells you the approximate whole
              <br />
              kernels per pound. A lower number means a larger nut.
            </p>
          </div>
          <div className="grade-table">
            <div className="grade-table-head">
              <span>THE GRADE</span>
              <span>THE CHARACTER</span>
              <span>YOUR PERFECT MOMENT</span>
              <span />
            </div>
            {[
              [
                "W-180",
                "The grand one",
                "Large whole kernels",
                "Thoughtful gifts & special occasions",
                "180",
              ],
              [
                "W-240",
                "The generous one",
                "Medium-large whole kernels",
                "Grazing boards & a satisfying snack",
                "240",
              ],
              [
                "W-320",
                "The everyday one",
                "Versatile whole kernels",
                "Daily handfuls, breakfast bowls & sharing",
                "320",
              ],
              [
                "Splits",
                "The kitchen companion",
                "Halved cashew kernels",
                "Creamy gravies, baking & blending",
                "split",
              ],
            ].map(([grade, title, description, moment, size]) => (
              <Link
                key={grade}
                href={`/shop?grade=${grade}`}
                className="grade-row"
              >
                <div className="grade-identity">
                  <span className={`cashew-shape cashew-${size}`} />
                  <strong>{grade}</strong>
                </div>
                <div>
                  <h3>{title}</h3>
                  <span>{description}</span>
                </div>
                <p>{moment}</p>
                <ArrowUpRight size={21} />
              </Link>
            ))}
          </div>
          <p className="grade-footnote">
            Grades describe kernel size and form. Check each product for
            ingredients and pack options.
          </p>
        </div>
      </section>
      <section className="standards-section">
        <div className="container standards-grid">
          <div>
            <span className="eyebrow">OUR STANDARDS, IN THE OPEN</span>
            <h2>
              Trust begins
              <br />
              with transparency.
            </h2>
          </div>
          <div className="standards-details">
            <div>
              <ShieldCheck size={25} />
              <span>
                <strong>FSSAI details</strong>
                <p>
                  {process.env.NEXT_PUBLIC_FSSAI_LICENSE
                    ? `License: ${process.env.NEXT_PUBLIC_FSSAI_LICENSE}`
                    : "Verified license details will be published here."}
                </p>
              </span>
            </div>
            <div>
              <Leaf size={25} />
              <span>
                <strong>Organic certification</strong>
                <p>
                  {process.env.NEXT_PUBLIC_ORGANIC_CERTIFICATE_URL ? (
                    <a
                      href={process.env.NEXT_PUBLIC_ORGANIC_CERTIFICATE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link"
                    >
                      View the certificate <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    "We make an organic claim only when supported by a valid certificate."
                  )}
                </p>
              </span>
            </div>
          </div>
        </div>
      </section>
      <Reviews />
      <section className="gift-section">
        <div className="container gift-inner">
          <div>
            <span className="eyebrow">GOODNESS IS BETTER SHARED</span>
            <h2>
              A thoughtful gift.
              <br />
              <em>A lovely little ritual.</em>
            </h2>
            <p>
              For the host, the family, the friend who has everything.
              <br />
              Give a little taste of something simple.
            </p>
            <Button asChild>
              <Link href="/shop?category=festive-hampers">
                Find a little something <ArrowUpRight size={18} />
              </Link>
            </Button>
          </div>
          <div className="gift-illustration" aria-hidden="true">
            <div className="gift-box">
              <Leaf size={42} strokeWidth={1} />
              <span>FarmDirect</span>
              <small>A LITTLE BOX OF GOODNESS</small>
            </div>
            <div className="gift-ribbon" />
            <span className="gift-handwritten">with love, from the farm</span>
          </div>
        </div>
      </section>
      <section className="faq-section section">
        <div className="container faq-grid">
          <div>
            <span className="eyebrow">A FEW LITTLE THINGS</span>
            <h2>
              Good questions.
              <br />
              Simple answers.
            </h2>
            <Link href="/help" className="text-link">
              A little more help <ArrowUpRight size={16} />
            </Link>
          </div>
          <div>
            {[
              [
                "What does W-320 mean?",
                "W stands for white whole kernels, and 320 is the approximate number of kernels per pound. W-180 and W-240 are larger kernels; splits are halved kernels suited to cooking.",
              ],
              [
                "How should I store my cashews?",
                "Keep the pack tightly closed in a cool, dry place, away from sunlight. For longer storage, refrigerate in an airtight container. Follow the best-before and storage instructions on your actual pack.",
              ],
              [
                "Can you deliver to my PIN code?",
                "Enter your six-digit PIN code on a product page or at checkout. We check it against our configured delivery coverage before accepting an order.",
              ],
              [
                "Are these suitable for someone with a nut allergy?",
                "Cashews are tree nuts. These products are unsuitable for people with a cashew or relevant tree-nut allergy. Always read the actual ingredient and allergen label before consuming.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
