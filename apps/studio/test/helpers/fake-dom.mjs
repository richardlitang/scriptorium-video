export class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.value = "";
    this.disabled = false;
    this.onclick = null;
    this.onchange = null;
    this.oninput = null;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.textContent = "";
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...items) {
    for (const item of items) {
      if (item === undefined || item === null) continue;
      if (typeof item === "string") {
        const text = new FakeElement("#text");
        text.textContent = item;
        this.children.push(text);
      } else {
        this.children.push(item);
      }
    }
  }
}

export function walkTree(node, visit) {
  visit(node);
  for (const child of node.children || []) walkTree(child, visit);
}

export function findFirst(root, predicate) {
  let found = null;
  walkTree(root, (node) => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

export function findButtonByText(root, text) {
  return findFirst(root, (node) => node.tagName === "BUTTON" && node.textContent === text);
}

export function findNodeByClass(root, className) {
  return findFirst(root, (node) => {
    const classes = String(node.className || "")
      .split(/\s+/)
      .filter(Boolean);
    return classes.includes(className);
  });
}

export function findNodeByText(root, text) {
  return findFirst(root, (node) => node.textContent === text);
}
