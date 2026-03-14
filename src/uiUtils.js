import { GT_ORDER, AUTO_EXPAND } from "./constants";

export const dynamicNodes = new Map();

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

function getValueByPath(obj, path) {

    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');

    let current = obj;

    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];    
    }

    return current;
}

export function updateDynamicTree(gt) {

    for (const [path, el] of dynamicNodes.entries()) {
        const value = getValueByPath(gt, path);
        console.log(path, value)

        if (value !== undefined) {
            el.textContent = value;
        }
    }
}

export function buildLazyTree(tree, gt) {

    if (!gt || typeof gt !== "object") return;
    
    const handled = new Set();
    
    // First render preferred order
    for (const key of GT_ORDER) {
        if (!(key in gt)) continue;

        const value = gt[key];

        if (typeof value === "object") {
            addLazyNode(tree, key, value, new WeakSet(), key);
        } 
        else {
            addLeaf(tree, `${key}: ${value}`);
        }

        handled.add(key);
    }

    for (const key of Object.keys(gt)) {
        if (handled.has(key) || key.startsWith("$") || key === "constructor") continue;

        const value = gt[key];

        if (typeof value === "object") {
            addLazyNode(tree, key, value, new WeakSet(), key);
        } 
        else {
            addLeaf(tree, `${key}: ${value}`);
        }
    }
}

function addLazyNode(parent, label, value, visited, path = "") {
    const li = document.createElement("li");
    li.classList.add("node");

    const title = document.createElement("span");
    title.textContent = label;

    const children = document.createElement("ul");

    li.appendChild(title);
    li.appendChild(children);

    parent.appendChild(li);

    let built = false;

    if (AUTO_EXPAND.has(path)) {
    buildChildren(children, value, visited, path);
    built = true;
    li.classList.add("open");
    }

    title.addEventListener("click", e => {

        li.classList.toggle("open");

        if (!built) {
            buildChildren(children, value, visited, path);
            built = true;
        }

        e.stopPropagation();
    });
}

function buildChildren(parent, data, visited, path = "") {

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
            const newPath = `${path}[${i}]`;
            if (typeof item === "object" && item !== null) {
                addLazyNode(parent, `[${i}]`, item, visited, newPath);
            }
            else {
                addDynamicLeaf(parent, `[${i}]`, newPath, item);
            }
        });

        return;
    }

    if (typeof data === "object") {

        const keys = new Set([...Object.keys(data), ...Object.getOwnPropertyNames(Object.getPrototypeOf(data) || {})]);
        
        for (const key of keys) {

            if (key.startsWith("$") || key === "constructor") continue;

            const value = data[key];
            const newPath = path ? `${path}.${key}` : key;

            if (typeof value === "object" && value !== null) {
                addLazyNode(parent, key, value, visited, newPath);
            } 
            else {
                addDynamicLeaf(parent, key, newPath, value);
            }
        }

        return;
    }

    addLeaf(parent, String(data));
}

function addLeaf(parent, label) {
    const li = document.createElement("li");
    li.textContent = label;

    parent.appendChild(li);
}

function addDynamicLeaf(parent, label, keyPath = null, value = null) {
    const li = document.createElement("li");

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;

    li.appendChild(labelSpan);

    if (keyPath !== null) {

        const valueSpan = document.createElement("span");
        valueSpan.textContent = value;

        li.appendChild(document.createTextNode(": "));
        li.appendChild(valueSpan);

        dynamicNodes.set(keyPath, valueSpan);
    }

    parent.appendChild(li);
}