import Link from "next/link";
export const metadata = { title: "Delivery & a little help" };
export default function HelpPage() {
  return (
    <div className="container prose-page">
      <span className="eyebrow">A LITTLE HELP GOES A LONG WAY</span>
      <h1>
        Good questions.
        <br />
        Simple answers.
      </h1>
      <h2>Delivery to your doorstep</h2>
      <p>
        Enter your six-digit Indian PIN on a product page or at checkout. We
        accept orders only within our configured serviceable PIN codes. Your
        delivery fee, eligible discounts, and estimated delivery time are shown
        before you pay.
      </p>
      <h2>Following your order</h2>
      <p>
        Save the order ID and private access key from your checkout
        confirmation. Use them on the{" "}
        <Link href="/track">order tracking page</Link> to see payment and
        packing updates. They are also kept for your current browser session.
        Keep your access key private.
      </p>
      <h2>Choosing a grade</h2>
      <p>
        Whole-kernel grades W-180, W-240, and W-320 describe approximate kernels
        per pound. Lower numbers mean larger kernels. Splits are halved kernels
        suited to cooking and blending. Read our{" "}
        <Link href="/#grade-guide">grade guide</Link> for a quick comparison.
      </p>
      <h2>Payments</h2>
      <p>
        Checkout uses Razorpay. Your order is treated as paid after the backend
        verifies a captured payment. If a payment is still being confirmed,
        check your tracking page before paying again.
      </p>
      <h2>Ingredients & storage</h2>
      <p>
        All products contain cashews, a tree nut. Read each actual pack’s
        ingredient, allergen, storage, and best-before details. Close the pack
        after use and store it in a cool, dry place.
      </p>
      <h2>Contacting the farm desk</h2>
      <p>
        {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ? (
          <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
            {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
          </a>
        ) : (
          "Store contact details will be published here before orders open."
        )}
      </p>
    </div>
  );
}
