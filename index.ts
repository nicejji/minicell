const ALPHA_REGEX = /^[a-zA-Z]+$/;
const DIGIT_REGEX = /^\d+$/;

type MathOp = "+" | "-" | "*" | "/";
type MathToken =
  | {
      type: "Operator";
      value: MathOp;
    }
  | {
      type: "Value";
      value: number;
    }
  | {
      type: "Ref";
      value: string;
    };
type MathExp = MathToken[];

type CellContent =
  | {
      type: "Value";
      value: number;
      src: string;
    }
  | {
      type: "Identifier";
      value: string;
      src: string;
    }
  | {
      type: "Expression";
      value: MathExp;
      src: string;
    };

type Cell = {
  content: CellContent;
  identifier: string;
};

const parseMathExp = (src: string): MathExp => {
  if (src[0] !== "=") {
    throw Error(`Invalid expression: ${src}`);
  }
  const chars = [...src].slice(1);
  const tokens: MathToken[] = [];
  while (chars.length > 0) {
    const char = chars.shift() as string;
    if (!char.trim().length) continue;
    // value
    if (char === "." || DIGIT_REGEX.test(char) || char === "-") {
      let numRaw = char;
      while (chars.length > 0) {
        const char = chars.shift() as string;
        if (char === "." || DIGIT_REGEX.test(char)) {
          numRaw += char;
        } else {
          chars.unshift(char);
          break;
        }
      }
      if (numRaw === "-") {
        tokens.push({ type: "Operator", value: numRaw });
      } else {
        const num = parseFloat(numRaw);
        if (isNaN(num)) {
          throw Error(`Invalid number literal: ${numRaw}`);
        }
        tokens.push({
          type: "Value",
          value: num,
        });
      }
      continue;
    }
    // operator
    if (char === "+" || char === "-" || char === "/" || char === "*") {
      tokens.push({ type: "Operator", value: char });
      continue;
    }
    // ref
    if (ALPHA_REGEX.test(char)) {
      let ref = char;
      while (chars.length > 0) {
        const char = chars.shift() as string;
        if (ALPHA_REGEX.test(char) || DIGIT_REGEX.test(char)) {
          ref += char;
        } else {
          chars.unshift(char);
          break;
        }
      }
      tokens.push({ type: "Ref", value: ref });
    }
    continue;
  }
  return tokens;
};

const parseCell = (src: string): CellContent => {
  if (ALPHA_REGEX.test(src)) {
    return {
      type: "Identifier",
      value: src,
      src,
    };
  }
  if (src[0] == "=") {
    return {
      type: "Expression",
      src,
      value: parseMathExp(src),
    };
  }
  if (!isNaN(parseFloat(src))) {
    return {
      type: "Value",
      src,
      value: parseFloat(src),
    };
  }
  throw Error(`Invalid Cell Value: ${src}`);
};

const parseCells = (src: string): [Cell[], CellContent[]] => {
  const cells: Cell[] = [];
  const cellsSrc = src
    .split("\n")
    .map((line) => line.split(",").filter((line) => line.trim()))
    .filter((c) => c.length)
    .map((c) => c.map((t) => t.trim()));
  if (!cellsSrc.length) return [[], []];
  if (!cellsSrc.every((row) => row.length === cellsSrc[0].length)) {
    throw Error("Invalid grid!");
  }
  const header = (cellsSrc.shift() as string[]).map((src) => parseCell(src));
  if (!header.every((cell) => cell.type === "Identifier")) {
    throw Error("Only Identifiers allowed in first row");
  }
  if (
    header.map((c) => c.value).length !==
    new Set(header.map((c) => c.value)).size
  ) {
    throw Error("Duplicate Identifiers");
  }
  for (const [i, row] of cellsSrc.entries()) {
    for (const [idIndex, cellSrc] of row.entries()) {
      const identifier = `${header[idIndex].value}${i + 1}`;
      const cellContent = parseCell(cellSrc);
      if (cellContent.type === "Identifier") {
        throw Error("Identifiers allowed only in first row");
      }
      cells.push({ content: cellContent, identifier });
    }
  }
  return [cells, header];
};

let refTrace: Cell[] = [];
const evalCell = (cell: Cell, cells: Cell[]): number => {
  if (refTrace.length > 1 && refTrace[0] === refTrace[refTrace.length - 1]) {
    throw new Error(
      `Cyclic reference: ${refTrace.map((c) => c.identifier).join(" -> ")}`,
    );
  }
  if (cell.content.type === "Identifier") {
    throw new Error(`Cannot evaluate identifier: ${cell.content.value}`);
  }
  if (cell.content.type === "Value") {
    return cell.content.value;
  }
  if (cell.content.type === "Expression") {
    const prepared = cell.content.value.map((token) => {
      if (token.type === "Ref") {
        if (refTrace.length === 0) refTrace.push(cell);
        const targetCell = cells.find((c) => c.identifier === token.value);
        if (!targetCell) throw Error(`Could not find ref to ${token.value}`);
        refTrace.push(targetCell);
        const value = evalCell(targetCell, cells);
        refTrace = [];
        return {
          type: "Value",
          value,
        } as const;
      }
      return token;
    });
    return calcMath(prepared);
  }
  throw Error(`Could not evalute cell: ${cell}`);
};

const calcMath = (cells: MathExp): number => {
  const result = 0;
  let prepared = [...cells];
  while (true) {
    const i = prepared.findIndex(
      (c) => c.type === "Operator" && (c.value === "*" || c.value === "/"),
    );
    if (i === -1) break;
    const left = prepared[i - 1].value as number;
    const right = prepared[i + 1].value as number;
    const v = prepared[i].value === "*" ? left * right : left / right;
    if (isNaN(v)) {
      throw Error(`Can't evaluate ${left} ${cells[i].value} ${right}`);
    }
    prepared.splice(i - 1, 3, { type: "Value", value: v });
  }
  while (true) {
    const i = prepared.findIndex(
      (c) => c.type === "Operator" && (c.value === "-" || c.value === "+"),
    );
    if (i === -1) break;
    const left = prepared[i - 1].value as number;
    const right = prepared[i + 1].value as number;
    const v = prepared[i].value === "+" ? left + right : left - right;
    if (isNaN(v)) {
      throw Error(`Can't evaluate ${left} ${cells[i].value} ${right}`);
    }
    prepared.splice(i - 1, 3, { type: "Value", value: v });
  }
  return prepared.reduce((acc, v) => {
    if (v.type === "Value") {
      return acc + v.value;
    } else {
      throw Error(`Error during execution: Invalid token ${v.value}`);
    }
  }, 0);
};

const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

try {
  const path = process.argv[2];
  const src = await Bun.file(path).text();
  // log src
  const [cells, header] = parseCells(src);
  console.log(
    header
      .map((c) => BLUE + BOLD + `${c.value}`.padEnd(18, " ") + RESET)
      .join(""),
  );
  for (let i = 0; i < cells.length; i += header.length) {
    const row = cells.slice(i, i + header.length).map((c) => {
      const valueToPrint = `${c.content.value}`.padEnd(18, " ");
      switch (c.content.type) {
        case "Value":
          return valueToPrint;
        case "Identifier":
          return BLUE + valueToPrint + RESET;
        case "Expression": {
          return (
            YELLOW +
            BOLD +
            "=" +
            RESET +
            c.content.value
              .map((exp) => {
                switch (exp.type) {
                  case "Value":
                    return BOLD + exp.value + RESET;
                  case "Operator":
                    return RED + BOLD + exp.value + RESET;
                  case "Ref":
                    return BLUE + BOLD + exp.value + RESET;
                }
              })
              .join("") +
            " ".repeat(Math.max(18 - c.content.src.length, 0))
          );
        }
      }
    });
    console.log(row.join(""));
  }
  const vals = cells.map((c) =>
    c.content.type !== "Identifier" ? evalCell(c, cells) : c,
  );
  // log result
  console.log("-".repeat(process.stdout.columns));
  console.log(
    header
      .map((c) => BLUE + BOLD + `${c.value}`.padEnd(18, " ") + RESET)
      .join(""),
  );
  for (let i = 0; i < vals.length; i += header.length) {
    const row = vals.slice(i, i + header.length);
    console.log(row.map((s) => `${s}`.padEnd(18, " ")).join(""));
  }
} catch (e) {
  console.error(String(e));
}
