import { Link } from "react-router";
import { buttonVariants } from "../components/ui/button";

const product = {
  name: "Your product",
  summary: "Describe what your product helps people do.",
  appUrl: "",
};

const ProductHome = () => (
  <main
    id="main"
    tabIndex={-1}
    className="mx-auto max-w-5xl px-5 py-20 sm:px-8"
  >
    <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
      {product.name}
    </h1>
    <p className="mt-4 max-w-xl text-lg text-muted-foreground">
      {product.summary}
    </p>
    <div className="mt-8 flex flex-wrap gap-3">
      <Link to="/docs" className={buttonVariants()}>
        Read the docs
      </Link>
      {product.appUrl && (
        <a
          href={product.appUrl}
          className={buttonVariants({ variant: "outline" })}
        >
          Open app
        </a>
      )}
    </div>
  </main>
);

export default ProductHome;
