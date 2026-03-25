import pc from "picocolors";

export function printHermesStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!debug) {
    console.log(line);
    return;
  }

  if (line.startsWith("[hermes]")) {
    console.log(pc.blue(line));
    return;
  }

  if (line.startsWith("┊")) {
    console.log(pc.cyan(line));
    return;
  }

  if (line.includes("💭") || line.startsWith("<thinking>")) {
    console.log(pc.dim(line));
    return;
  }

  if (
    line.startsWith("Error:") ||
    line.startsWith("ERROR:") ||
    line.startsWith("Traceback")
  ) {
    console.log(pc.red(line));
    return;
  }

  if (/session/i.test(line) && /id|saved|resumed/i.test(line)) {
    console.log(pc.green(line));
    return;
  }

  console.log(pc.gray(line));
}
