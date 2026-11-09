const fs = require("fs");
const path = require("path");

// patches: [file, oldText, newText]. The old text must appear exactly once.
module.exports = function apply(patches) {
  let bad = 0;
  for (const [file, oldText, newText] of patches) {
    const full = path.join(__dirname, "..", file);
    if (!fs.existsSync(full)) {
      console.log("MISSING FILE  ", file);
      bad++;
      continue;
    }

    const text = fs.readFileSync(full, "utf8");
    const crlf = text.includes("\r\n");
    const o = crlf ? oldText.replace(/\n/g, "\r\n") : oldText;
    const n = crlf ? newText.replace(/\n/g, "\r\n") : newText;

    if (text.includes(n)) {
      console.log("already done  ", file);
      continue;
    }

    const count = text.split(o).length - 1;
    if (count !== 1) {
      console.log(
        count === 0 ? "NOT FOUND     " : "FOUND TWICE   ",
        file,
        "->",
        oldText.trim().split("\n")[0].slice(0, 70),
      );
      bad++;
      continue;
    }
    fs.writeFileSync(
      full,
      text.replace(o, () => n),
    );
    console.log("OK            ", file);
  }
  console.log(
    bad
      ? `\n${bad} patch(es) need attention. Send me the lines above.`
      : "\nAll patches applied.",
  );
};
