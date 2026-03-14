import { GT_ORDER } from "./constants";

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

export function buildLazyTree(tree, gt) {

    if (!gt || typeof gt !== "object") return;
    
    const handled = new Set();
    
    // First render preferred order
    for (const key of GT_ORDER) {
        if (!(key in gt)) continue;

        const value = gt[key];

        if (typeof value === "object") {
            addLazyNode(tree, key, value, new WeakSet());
        } else {
            addLeaf(tree, `${key}: ${value}`);
        }

        handled.add(key);
    }

    for (const key of Object.keys(gt)) {
        if (handled.has(key)) continue;
        if (key.startsWith("$") || key === "constructor") continue;

        const value = gt[key];

        if (typeof value === "object") {
            addLazyNode(tree, key, value, new WeakSet());
        } 
        else {
            addLeaf(tree, `${key}: ${value}`);
        }
    }
}

function addLazyNode(parent, label, value, visited) {

    const li = document.createElement("li");
    li.classList.add("node");

    const title = document.createElement("span");
    title.textContent = label;

    const children = document.createElement("ul");

    li.appendChild(title);
    li.appendChild(children);

    parent.appendChild(li);

    let built = false;

    title.addEventListener("click", e => {

        li.classList.toggle("open");

        if (!built) {

            buildChildren(children, value, visited);
            built = true;

        }

        e.stopPropagation();
    });
}

function buildChildren(parent, data, visited) {

    if (data === null || data === undefined) {
        addLeaf(parent, String(data));
        return;
    }

    if (typeof data === "object") {

        if (visited.has(data)) {
            addLeaf(parent, "[circular]");
            return;
        }

        visited.add(data);
    }

    if (Array.isArray(data)) {

        data.forEach((item, i) => {

            if (typeof item === "object" && item !== null) {

                addLazyNode(parent, `[${i}]`, item, visited);

            } else {

                addLeaf(parent, `[${i}]: ${item}`);

            }

        });

        return;
    }

    if (typeof data === "object") {

        buildLazyTree(parent, data, visited);
        return;

    }

    addLeaf(parent, String(data));
}

function addLeaf(parent, label) {

    const li = document.createElement("li");
    li.textContent = label;

    parent.appendChild(li);
}