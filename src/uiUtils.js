// Copy-paste text macro
export function setCopyable(el, value) {

    const fullText = value || "-";

    el.textContent = fullText;
    el.title = fullText;
    el.classList.add("copyable");

    // Prevent duplicate listeners
    if (el._copyEnabled) return;
    el._copyEnabled = true;

    el.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(fullText);

            el.classList.add("copied");

            setTimeout(() => {
                el.classList.remove("copied");
            }, 400);

        } catch (err) {
            console.error("Clipboard failed:", err);
        }
    });
}

export function buildTree(parent, data, visited = new WeakSet()) {

    if (data === null || data === undefined) {
        addLeaf(parent, String(data));
        return;
    }

    // Prevent circular references
    if (typeof data === "object") {
        if (visited.has(data)) {
            addLeaf(parent, "[circular]");
            return;
        }
        visited.add(data);
    }

    // Arrays
    if (Array.isArray(data)) {

        data.forEach((item, i) => {

            const node = addNode(parent, `[${i}]`);
            buildTree(node, item, visited);

        });

        return;
    }

    // Objects
    if (typeof data === "object") {

        for (const key of Object.keys(data)) {

            const value = data[key];

            if (typeof value === "object" && value !== null) {

                const node = addNode(parent, key);
                buildTree(node, value, visited);

            } else {

                addLeaf(parent, `${key}: ${value}`);

            }

        }

        return;
    }

    // Primitive
    addLeaf(parent, String(data));
}

export function addNode(parent, label) {

    const li = document.createElement("li");
    li.classList.add("node");

    const title = document.createElement("span");
    title.textContent = label;

    const children = document.createElement("ul");

    li.appendChild(title);
    li.appendChild(children);

    parent.appendChild(li);

    title.addEventListener("click", e => {
        li.classList.toggle("open");
        e.stopPropagation();
    });

    return children;
}

function addLeaf(parent, label) {

    const li = document.createElement("li");
    li.textContent = label;

    parent.appendChild(li);
}