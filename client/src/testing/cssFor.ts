export const cssFor = (element: Element): string => {
  const classes = Array.from(element.classList).filter((name) => name.startsWith("css-"));
  const rules = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n")
    .split("}");
  return rules.filter((rule) => classes.some((name) => rule.includes(`.${name}`))).join("}");
};
