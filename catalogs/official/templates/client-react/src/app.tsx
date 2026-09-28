import { ThemeToggle } from "./components/theme-toggle";

function App() {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 p-4">
      <ThemeToggle />

      <div className="text-center">
        <h1 className="font-black text-5xl">{{targetName}}</h1>
        <p className="text-muted-foreground">A typesafe fullstack monorepo</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 auto-rows-[30rem] lg:auto-rows-[22rem] lg:grid-cols-2">
        {/* @slot:components */}
      </div>
    </div>
  );
}

export default App;
