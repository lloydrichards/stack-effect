import { Runtime } from "foldkit";
import "./styles.css";
import { init, Model, subscriptions, update, view } from "./main";

const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById("root"),
});

Runtime.run(program);
