export const metadata = { title: "Store policies" };
export default function PoliciesPage() {
  return (
    <div className="container prose-page">
      <span className="eyebrow">CLEAR FROM THE BEGINNING</span>
      <h1>The details matter.</h1>
      <div className="notice">
        <strong>Prelaunch policy page</strong>
        <p>
          The farm’s legal identity, contact details, cancellation terms,
          returns and refunds policy, and complete privacy notice must be
          completed and reviewed before accepting live orders.
        </p>
      </div>
      <h2>How this store uses your details</h2>
      <p>
        Checkout collects your name, email, phone number, and shipping address
        to create and fulfil your order. Razorpay processes payment details. The
        store retains the payment reference, amount, and status; card numbers
        and banking credentials are not collected by this application.
      </p>
      <h2>Shopping bag & order access</h2>
      <p>
        Your shopping bag is stored in your browser. Your private tracking key
        is kept in session storage. The farm desk can access order and delivery
        details after an administrator signs in.
      </p>
      <h2>Product information</h2>
      <p>
        Pack images are illustrations. The actual pack provides the
        authoritative ingredients, allergen statements, net weight,
        manufacturing and best-before details. Verified FSSAI and any organic
        certificate details are displayed only when supplied by the farm.
      </p>
      <h2>Returns, cancellations & refunds</h2>
      <p>
        The farm’s specific terms will be published here before launch. If
        payment is under review, the store must reconcile the payment and
        inventory or arrange a refund through Razorpay before fulfilling the
        order.
      </p>
    </div>
  );
}
