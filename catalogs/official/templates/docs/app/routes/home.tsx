import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "../components/ui/button";

const Home = () => (
  <main
    id="main"
    tabIndex={-1}
    className="mx-auto max-w-3xl px-5 py-20 sm:px-8"
  >
    <h1 className="mb-5 text-4xl font-semibold tracking-tight">
      Documentation
    </h1>
    <Link to="/docs" className={buttonVariants({ size: "lg" })}>
      Read the docs <ArrowRight aria-hidden="true" />
    </Link>
  </main>
);

export default Home;
