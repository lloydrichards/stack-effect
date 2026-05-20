import { Runtime } from "foldkit";

import { init, Message, Model, subscriptions, update, view } from "./main";

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById("root"),
  devTools: {
    Message,
  },
});

Runtime.run(program);
