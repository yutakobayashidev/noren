export default function quote({ post }) {
  return { kind: "copyText", text: post.text.split("\n").map(line => "> " + line).join("\n") };
}
