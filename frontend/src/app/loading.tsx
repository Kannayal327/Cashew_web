export default function Loading() {
  return (
    <div className="container loading-page" role="status">
      <span className="eyebrow">A LITTLE GOODNESS IS ON ITS WAY</span>
      <div className="skeleton skeleton-title" />
      <div className="product-grid">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="skeleton skeleton-card" />
        ))}
      </div>
      <span className="sr-only">Loading the store</span>
    </div>
  );
}
