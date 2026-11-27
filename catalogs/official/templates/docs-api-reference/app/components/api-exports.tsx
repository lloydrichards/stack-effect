import exports from "../lib/api-exports.json";

type ApiEntry = {
  entryPoint: string;
  members: ReadonlyArray<{ name: string; summary: string }>;
};

const entries: ReadonlyArray<ApiEntry> = exports;

export const ApiExports = () =>
  entries.length === 0 ? (
    <p>Generate the reference to show your library’s exports here.</p>
  ) : (
    entries.map(({ entryPoint, members }) => (
      <section className="mt-6" key={entryPoint}>
        <h2>{entryPoint}</h2>
        <dl className="space-y-4">
          {members.map(({ name, summary }) => (
            <div key={name}>
              <dt>
                <code>{name}</code>
              </dt>
              {summary && <dd>{summary}</dd>}
            </div>
          ))}
        </dl>
      </section>
    ))
  );
