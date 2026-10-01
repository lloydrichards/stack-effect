import { AgentBootstrap } from "~/components/agent-bootstrap";
import { typefaceHeading1 } from "~/components/tokens/typeface";
import Guide, * as guideModule from "~/content/use-with-coding-agents.mdx";

export const handle = "handle" in guideModule ? guideModule.handle : undefined;

export default function UseWithCodingAgentsRoute() {
  return (
    <>
      <h1 className={typefaceHeading1("mt-2 scroll-m-20")}>
        Use Stack Effect with coding agents
      </h1>
      <AgentBootstrap />
      <Guide components={{ h1: () => null }} />
    </>
  );
}
