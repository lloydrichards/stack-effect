// Function-shape rules from the taste guide that oxlint has no built-in rule for.

const isFunction = (node) =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionExpression" ||
  node?.type === "FunctionDeclaration";

const isLoop = (node) =>
  node.type === "ForOfStatement" ||
  node.type === "ForStatement" ||
  node.type === "ForInStatement" ||
  node.type === "WhileStatement" ||
  node.type === "DoWhileStatement";

const wrappers = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "ParenthesizedExpression",
]);

// Type assertions do not change what an expression builds.
const unwrap = (node) => {
  let current = node;
  while (wrappers.has(current?.type)) {
    current = current.expression;
  }
  return current;
};

// The parent once type assertions around `node` are skipped.
const outerParent = (node) => {
  let current = node;
  while (wrappers.has(current.parent?.type)) current = current.parent;
  return current.parent;
};

const isMember = (node, object, properties) =>
  node?.type === "MemberExpression" &&
  !node.computed &&
  node.object.type === "Identifier" &&
  node.object.name === object &&
  properties.includes(node.property.name);

// ---------------------------------------------------------------------------
// max-inputs

const isEffectFn = (callee) => isMember(callee, "Effect", ["fn", "fnUntraced"]);

// `Effect.fn(gen)`, `Effect.fn("name")(gen, ...pipeables)`, `Effect.fnUntraced(gen)`.
const effectFnCall = (fn) => {
  const call = outerParent(fn);
  if (call?.type !== "CallExpression" || unwrap(call.arguments[0]) !== fn)
    return undefined;
  if (isEffectFn(call.callee)) return call;
  if (call.callee.type === "CallExpression" && isEffectFn(call.callee.callee))
    return call;
  return undefined;
};

const namingParents = new Set([
  "VariableDeclarator",
  "Property",
  "MethodDefinition",
  "PropertyDefinition",
  "AssignmentExpression",
]);

const isNamed = (fn) => {
  if (fn.type === "FunctionDeclaration") return true;
  const call = effectFnCall(fn);
  const parent = outerParent(call ?? fn);
  if (!parent || !namingParents.has(parent.type)) return false;
  if (parent.type === "VariableDeclarator")
    return unwrap(parent.init) === (call ?? fn);
  if (parent.type === "AssignmentExpression")
    return unwrap(parent.right) === (call ?? fn);
  return unwrap(parent.value) === (call ?? fn);
};

const inputCount = (fn) =>
  fn.params.reduce((count, param) => {
    const pattern =
      param.type === "TSParameterProperty" ? param.parameter : param;
    const target =
      pattern.type === "AssignmentPattern" ? pattern.left : pattern;
    if (target.type === "Identifier" && target.name === "this") return count;
    return (
      count + (target.type === "ObjectPattern" ? target.properties.length : 1)
    );
  }, 0);

const maxInputs = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Limit a named function to a few inputs, counting destructured fields.",
    },
    schema: [
      {
        type: "object",
        properties: { max: { type: "integer", minimum: 0 } },
        additionalProperties: false,
      },
    ],
  },
  create: (context) => {
    const max = context.options[0]?.max ?? 4;
    const tsx = context.filename.endsWith(".tsx");
    const check = (fn) => {
      if (tsx && fn.params.length === 1) return;
      if (fn.params.length === 0) return;
      const count = inputCount(fn);
      if (count <= max || !isNamed(fn)) return;
      context.report({
        node: fn,
        message: `This function takes ${count} inputs (max ${max}). Name the domain value or service they belong to and pass that instead.`,
      });
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};

// ---------------------------------------------------------------------------
// no-push-accumulator

const isEmptyCollection = (init) => {
  const node = unwrap(init);
  if (node?.type === "ArrayExpression") return node.elements.length === 0;
  return (
    node?.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "Map" || node.callee.name === "Set") &&
    node.arguments.length === 0
  );
};

const isCollectionSeed = (seed) => {
  const node = unwrap(seed);
  if (node?.type === "ArrayExpression") return node.elements.length === 0;
  if (node?.type === "ObjectExpression") return node.properties.length === 0;
  return (
    node?.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "Map" || node.callee.name === "Set")
  );
};

const writeMethods = new Set(["push", "add", "set"]);

const isWriteCall = (identifier) => {
  const member = identifier.parent;
  return (
    member.type === "MemberExpression" &&
    member.object === identifier &&
    !member.computed &&
    writeMethods.has(member.property.name) &&
    member.parent.type === "CallExpression" &&
    member.parent.callee === member
  );
};

// The outermost loop between `node` and `boundary`, or null when a function
// boundary sits in between (a callback writes it) or there is no loop.
const outermostLoop = (node, boundary) => {
  let loop = null;
  for (
    let current = node.parent;
    current && current !== boundary;
    current = current.parent
  ) {
    if (isFunction(current)) return null;
    if (isLoop(current)) loop = current;
  }
  return loop;
};

const contains = (ancestor, node) => {
  for (let current = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
};

// Every child AST node of `node`, skipping the `parent` back-reference.
const childNodes = (node) => {
  const children = [];
  for (const key in node) {
    if (key === "parent") continue;
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === "string") children.push(child);
    }
  }
  return children;
};

const jumps = new Set([
  "ReturnStatement",
  "BreakStatement",
  "ContinueStatement",
]);

const isScopeEdge = (node) => isFunction(node) || node.type === "ClassBody";

// Whether a `return`/`break`/`continue` leaves the loop labelled `label`, given
// which bare jumps still target that loop.
const jumpsOut = (node, label, owns) => {
  if (node.type === "ReturnStatement") return true;
  if (node.label) return node.label.name === label;
  return node.type === "BreakStatement" ? owns.break : owns.continue;
};

// A nested loop takes bare `break` and `continue`; a `switch` takes bare `break`.
const ownedJumps = (node, owns) => {
  const nestedLoop = isLoop(node);
  return {
    break: owns.break && !nestedLoop && node.type !== "SwitchStatement",
    continue: owns.continue && !nestedLoop,
  };
};

// True when the loop body leaves early: any `return`, or a `break`/`continue`
// whose target is `loop` itself.
const exitsEarly = (loop) => {
  const label =
    loop.parent.type === "LabeledStatement"
      ? loop.parent.label.name
      : undefined;
  const visit = (node, owns) => {
    if (isScopeEdge(node)) return false;
    if (jumps.has(node.type)) return jumpsOut(node, label, owns);
    const inner = ownedJumps(node, owns);
    return childNodes(node).some((child) => visit(child, inner));
  };
  return visit(loop.body, { break: true, continue: true });
};

// Visit `node` and its descendants, without entering nested functions, until
// `predicate` matches.
const someDescendant = (node, predicate) =>
  predicate(node) ||
  (!isFunction(node) &&
    childNodes(node).some((child) => someDescendant(child, predicate)));

const worklistMethods = new Set(["pop", "shift", "unshift", "splice"]);

// A stack or queue loop (`queue.shift()`, `stack.pop()`, or pushing onto the
// array being iterated) is an algorithm, not a collection build.
const isWorklist = (loop) => {
  const iterated =
    loop.type === "ForOfStatement" && loop.right.type === "Identifier"
      ? loop.right.name
      : undefined;
  return someDescendant(loop, (node) => {
    if (node.type !== "CallExpression") return false;
    const callee = node.callee;
    if (callee.type !== "MemberExpression" || callee.computed) return false;
    if (worklistMethods.has(callee.property.name)) return true;
    return (
      iterated !== undefined &&
      callee.object.type === "Identifier" &&
      callee.object.name === iterated &&
      writeMethods.has(callee.property.name)
    );
  });
};

const isArrayModule = (node, arrayModules) =>
  node.type === "Identifier" && arrayModules.has(node.name);

// `import * as Arr from "effect/Array"` or `import { Array as Arr } from "effect"`.
const importsArrayModule = (source, specifier) =>
  specifier.type === "ImportSpecifier"
    ? source === "effect" &&
      (specifier.imported.name ?? specifier.imported.value) === "Array"
    : source === "effect/Array";

const accumulatorLoops = new Set(["ForOfStatement", "ForStatement"]);

const isAccumulatorDeclaration = (node) =>
  node.id.type === "Identifier" &&
  node.parent.kind === "const" &&
  isEmptyCollection(node.init);

// The one `for`/`for…of` that holds every write to the accumulator.
const accumulatorLoop = (identifiers, declarator) => {
  const boundary = declarator.parent.parent;
  const owners = new Set(
    identifiers
      .filter(isWriteCall)
      .map((identifier) => outermostLoop(identifier, boundary)),
  );
  const [loop] = owners;
  return owners.size === 1 && accumulatorLoops.has(loop?.type)
    ? loop
    : undefined;
};

// The loop only appends: it never reads the accumulator, exits early, or works
// through a stack or queue.
const onlyAppends = (identifiers, loop) =>
  !identifiers.some(
    (identifier) => !isWriteCall(identifier) && contains(loop, identifier),
  ) &&
  !exitsEarly(loop) &&
  !isWorklist(loop);

const reduceMethods = new Set(["reduce", "reduceRight"]);

const isReduceCall = (callee) =>
  callee.type === "MemberExpression" &&
  !callee.computed &&
  reduceMethods.has(callee.property.name);

// Data-first `Arr.reduce(xs, seed, f)` or data-last `Arr.reduce(seed, f)`.
const moduleSeed = (args) =>
  args.length < 2 ? undefined : args[args.length === 3 ? 1 : 0];

const methodSeed = (args) => (args.length === 2 ? args[1] : undefined);

const noPushAccumulator = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Build a collection as one expression instead of pushing into it from a loop.",
    },
  },
  create: (context) => {
    const arrayModules = new Set();
    const message =
      "Build this collection as one expression (map, filter, flatMap, groupBy) instead of accumulating it.";
    return {
      ImportDeclaration: (node) => {
        for (const specifier of node.specifiers) {
          if (importsArrayModule(node.source.value, specifier)) {
            arrayModules.add(specifier.local.name);
          }
        }
      },
      VariableDeclarator: (node) => {
        if (!isAccumulatorDeclaration(node)) return;
        const [variable] = context.sourceCode.getDeclaredVariables(node);
        const identifiers = (variable?.references ?? [])
          .map((reference) => reference.identifier)
          .filter((identifier) => identifier !== node.id);
        const loop = accumulatorLoop(identifiers, node);
        if (loop && onlyAppends(identifiers, loop)) {
          context.report({ node, message });
        }
      },
      CallExpression: (node) => {
        if (!isReduceCall(node.callee)) return;
        const seed = isArrayModule(node.callee.object, arrayModules)
          ? moduleSeed(node.arguments)
          : methodSeed(node.arguments);
        if (isCollectionSeed(seed)) context.report({ node, message });
      },
    };
  },
};

// ---------------------------------------------------------------------------
// no-error-factory

const errorName = /(Error|Failure)$/;

const constructsError = (expression) => {
  const node = unwrap(expression);
  if (node?.type !== "NewExpression") return false;
  const callee = node.callee;
  const name =
    callee.type === "Identifier"
      ? callee.name
      : callee.type === "MemberExpression" && !callee.computed
        ? callee.property.name
        : undefined;
  return name !== undefined && errorName.test(name);
};

// The value a factory returns after unwrapping curried arrows and a body that
// is a single `return`.
const factoryResult = (fn) => {
  let body = fn.body;
  for (;;) {
    if (body.type === "BlockStatement") {
      if (body.body.length !== 1 || body.body[0].type !== "ReturnStatement")
        return undefined;
      body = body.body[0].argument;
      if (!body) return undefined;
    }
    const inner = unwrap(body);
    if (
      inner?.type === "ArrowFunctionExpression" ||
      inner?.type === "FunctionExpression"
    ) {
      body = inner.body;
      continue;
    }
    return inner;
  }
};

const noErrorFactory = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Construct an error inline where the step fails instead of through a factory.",
    },
  },
  create: (context) => ({
    VariableDeclarator: (node) => {
      const init = unwrap(node.init);
      if (
        init?.type !== "ArrowFunctionExpression" &&
        init?.type !== "FunctionExpression"
      )
        return;
      if (init.generator || init.async) return;
      const result = factoryResult(init);
      if (!result) return;
      const failed =
        result.type === "CallExpression" &&
        isMember(result.callee, "Effect", ["fail"]) &&
        constructsError(result.arguments[0]);
      if (!failed && !constructsError(result)) return;
      context.report({
        node,
        message:
          "Construct the error inline at the failing step instead of through a factory.",
      });
    },
  }),
};

// ---------------------------------------------------------------------------
// error-name

const errorBases = [
  ["Schema", ["TaggedError", "ErrorClass"]],
  ["Data", ["TaggedError"]],
];

// `Schema.TaggedError<X>()("X", fields)` and `Data.TaggedError("X")` nest calls
// around the base, so follow callees down to it.
const errorBase = (superClass) => {
  let current = unwrap(superClass);
  if (current?.type !== "CallExpression") return undefined;
  while (current.type === "CallExpression") current = current.callee;
  return errorBases.some(([object, properties]) =>
    isMember(current, object, properties),
  )
    ? current
    : undefined;
};

const errorNameRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Name an error `<Operation>Error` or for its condition, never `…Failure`.",
    },
  },
  create: (context) => {
    const check = (node) => {
      if (!node.id?.name.endsWith("Failure") || !errorBase(node.superClass))
        return;
      context.report({
        node: node.id,
        message:
          "Name an operation's error `<Operation>Error`, and an error callers handle separately for its condition. Do not use a `Failure` suffix.",
      });
    };
    return { ClassDeclaration: check, ClassExpression: check };
  },
};

// ---------------------------------------------------------------------------
// no-cause-message

const propertyNamed = (properties, name) =>
  properties.find(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      (property.key.name ?? property.key.value) === name,
  );

const interpolatesMessage = (value) =>
  value?.type === "TemplateLiteral" &&
  value.expressions.some((expression) => {
    const member = unwrap(expression);
    return (
      member.type === "MemberExpression" &&
      !member.computed &&
      member.property.name === "message"
    );
  });

const noCauseMessage = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Keep the cause's message out of an error message that carries the cause.",
    },
  },
  create: (context) => ({
    NewExpression: (node) => {
      const fields = unwrap(node.arguments[0]);
      if (fields?.type !== "ObjectExpression") return;
      if (!propertyNamed(fields.properties, "cause")) return;
      const message = propertyNamed(fields.properties, "message");
      if (!interpolatesMessage(unwrap(message?.value))) return;
      context.report({
        node: message,
        message:
          "Name the failed action and its subject in `message`; `cause` already carries why, and the presenter prints it.",
      });
    },
  }),
};

export default {
  meta: { name: "shape" },
  rules: {
    "max-inputs": maxInputs,
    "no-push-accumulator": noPushAccumulator,
    "no-error-factory": noErrorFactory,
    "error-name": errorNameRule,
    "no-cause-message": noCauseMessage,
  },
};
