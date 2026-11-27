import { Link } from "react-router";

const About = () => (
  <main
    id="main"
    tabIndex={-1}
    className="typeset mx-auto max-w-3xl px-5 py-12 sm:px-8"
  >
    <h1>About</h1>
    <p>Introduce the project, who it is for, and where to learn more.</p>
    <p>
      <Link to="/docs">Read the docs</Link>
    </p>
  </main>
);

export default About;
