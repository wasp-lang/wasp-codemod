import { API, FileInfo, Options } from "jscodeshift";

export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  // This replaces every occurrence of variable "foo".
  return api.jscodeshift(fileInfo.source).findVariableDeclarators("foo").renameTo("bar").toSource();
}
