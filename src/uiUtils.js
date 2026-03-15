import { GT_ORDER, AUTO_EXPAND, dynamicRoots } from "./constants";

export function initTree(gt) {
    const tree = document.getElementById("gtTree");
    tree.innerHTML = "";

    GT_ORDER.forEach(key => {
        // FIX #2: Even if it doesn't exist yet, we create a placeholder 
        // if it's a dynamic root or in our order list.
        const data = gt[key] !== undefined ? gt[key] : null;
        const li = createNode(key, data);
        
        if (dynamicRoots.includes(key)) li.dataset.dynamic = "true";
        if (AUTO_EXPAND.has(key)) li.classList.add("open");
        
        tree.appendChild(li);
    });
}

function createNode(key, data) {
    const li = document.createElement("li");
    li.classList.add("node");
    li.dataset.nodeKey = key;

    const isObject = data !== null && typeof data === "object";

    if (isObject) {
        const title = document.createElement("span");
        title.textContent = key;
        title.classList.add("caret");
        
        const childrenUl = document.createElement("ul");
        li.appendChild(title);
        li.appendChild(childrenUl);

        // Populate sub-tree
        const entries = Array.isArray(data) 
            ? data.map((v, i) => [`[${i}]`, v]) 
            : Object.entries(data);

        entries.forEach(([k, v]) => {
            if (k.startsWith("$") || k === "constructor") return;
            childrenUl.appendChild(createNode(k, v));
        });

        // The "Brain" of the expansion
        title.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const parentLi = e.currentTarget.parentElement;
            parentLi.classList.toggle("open");
        };
    } else {
        const val = (data === null || data === undefined) ? "" : data;
        li.innerHTML = `${key} <span class="leaf-value">${val}</span>`;
    }
    return li;
}

export function updateTree(gt) {
    // Look for all roots that are designated as dynamic
    const roots = document.querySelectorAll("#gtTree > li[data-dynamic='true']");
    
    roots.forEach(li => {
        const key = li.dataset.nodeKey;
        const newData = gt[key];
        
        // Use a "State Switcher" to handle the update
        syncBranchOrLeaf(li, key, newData);
    });
}

function reconcile(ul, data) {
    if (!ul) return;
    
    // Proto3/OSI fix: If data is missing (0/default), we might need to 
    // force specific fields like 'seconds' or 'nanos' if they are known keys
    const entries = [];
    if (data !== null && data !== undefined) {
        if (Array.isArray(data)) {
            data.forEach((v, i) => entries.push([`[${i}]`, v]));
        } else if (typeof data === "object") {
            // If it's a timestamp object specifically, ensure we show 0s
            if ('seconds' in data || 'nanos' in data) {
                entries.push(["seconds", data.seconds || 0]);
                entries.push(["nanos", data.nanos || 0]);
            } else {
                Object.entries(data).forEach(([k, v]) => {
                    if (!k.startsWith("$") && k !== "constructor") entries.push([k, v]);
                });
            }
        }
    }

    const existingNodes = new Map();
    Array.from(ul.children).forEach(child => {
        existingNodes.set(child.dataset.nodeKey, child);
    });

    entries.forEach(([key, value]) => {
        if (existingNodes.has(key)) {
            updateElement(existingNodes.get(key), value);
            existingNodes.delete(key);
        } else {
            ul.appendChild(createNode(key, value));
        }
    });

    existingNodes.forEach(node => ul.removeChild(node));
}

function updateElement(li, newData) {
    const valueSpan = li.querySelector(":scope > .leaf-value");
    const childrenUl = li.querySelector(":scope > ul");

    // Fix #1: Treat 0 as a string "0" instead of falsy
    const nextVal = (newData === undefined || newData === null) ? "" : String(newData);

    if (valueSpan) {
        if (valueSpan.textContent !== nextVal) {
            valueSpan.textContent = nextVal;
        }
    } else if (childrenUl) {
        reconcile(childrenUl, newData);
    }
}

function syncBranchOrLeaf(li, key, newData) {
    const childrenUl = li.querySelector(":scope > ul");
    const isNewDataValidObject = newData !== null && typeof newData === "object";

    // TRANSFORMATION: From Null/Value to Object/Array
    if (isNewDataValidObject && !childrenUl) {
        // 1. Create a fresh branch node
        const freshNode = createNode(key, newData);
        
        // 2. Clear the old leaf (the "key: null" text node)
        li.innerHTML = "";
        
        // 3. Move all elements from freshNode into our existing li
        // This includes the <span> (with its listener) and the <ul>
        while (freshNode.firstChild) {
            li.appendChild(freshNode.firstChild);
        }
        
        li.classList.add("open");
        // 4. Clean up: Ensure it's ready for interaction
        return;
    }

    if (!isNewDataValidObject && childrenUl) {
        // Remove the 'open' state and the nested UL
        li.classList.remove("open");
        const val = (newData === null || newData === undefined) ? "" : newData;
        
        // Revert to simple leaf HTML
        li.innerHTML = `${key} <span class="leaf-value">${val}</span>`;
        return;
    }

    // REGULAR UPDATE: It's a branch, keep syncing
    if (childrenUl && isNewDataValidObject) {
        reconcile(childrenUl, newData);
    } 
    // REGULAR UPDATE: It's a leaf, update the value
    else {
        const valSpan = li.querySelector(".leaf-value");
        if (valSpan) {
            const val = (newData === null || newData === undefined) ? "" : newData;
            if (valSpan.textContent !== String(val)) {
                valSpan.textContent = val;
            }
        }
    }
}

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
