/** @param {{post: {text: string, url: string}}} input */
export default function run({ post }) {
  const quote = post.text
    .split("\n")
    .map((line) => "> " + line)
    .join("\n");
  return { kind: "copyText", text: quote + "\n\n" + post.url };
}
