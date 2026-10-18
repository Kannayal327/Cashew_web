import Link from "next/link";
import { ArrowUpRight, Leaf } from "lucide-react";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Link href="/" className="brand footer-brand">
              <Leaf size={30} />
              <span>
                FarmDirect<small>CASHEWS</small>
              </span>
            </Link>
            <p>
              A simpler way to enjoy the good things.
              <br />
              From a single origin to your everyday rituals.
            </p>
            <span className="footer-note">
              Grown with a story. Shared with care.
            </span>
          </div>
          <div className="footer-links">
            <div>
              <span>THE GOOD STUFF</span>
              <Link href="/shop">Shop all cashews</Link>
              <Link href="/shop?category=festive-hampers">
                Thoughtful gifts
              </Link>
              <Link href="/#grade-guide">Our grade guide</Link>
            </div>
            <div>
              <span>A LITTLE HELP</span>
              <Link href="/track">Track your order</Link>
              <Link href="/help">Delivery & FAQs</Link>
              <Link href="/policies">Store policies</Link>
              {process.env.NEXT_PUBLIC_SUPPORT_EMAIL && (
                <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
                  Get in touch <ArrowUpRight size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FarmDirect Cashews</span>
          <span>Secure payments via Razorpay · UPI · Cards · Netbanking</span>
          <Link href="/admin">
            Farm desk <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
