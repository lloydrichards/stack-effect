import {
  type JsxExpression,
  Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

/** @internal */
export const makeJsxSourceFile = (contents: string): SourceFile =>
  new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  }).createSourceFile("temp.tsx", contents);

/** @internal */
export const jsxSlotMarker = (slotId: string) => `{/* @slot:${slotId} */}`;

/** @internal */
export const findJsxSlotMarker = (
  sourceFile: SourceFile,
  slotId: string,
): JsxExpression | undefined => {
  const marker = jsxSlotMarker(slotId);
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxExpression)
    .find((expression) => expression.getText() === marker);
};

/** @internal */
export const isJsxSlotMarker = (expression: JsxExpression): boolean =>
  /^\{\/\* @slot:[^*]+ \*\/\}$/u.test(expression.getText());
