import { GT_ORDER, AUTO_EXPAND, dynamicRoots } from "./constants";

export function focusAndExpandObject(topic, osiId) {
    const topicLi = document.querySelector(`#gtTree > li[data-node-key='${topic}']`);
    if (!topicLi) return;

    const indexNodes = topicLi.querySelectorAll(":scope > ul > li");
    let targetIndexLi = null;

    for (const li of indexNodes) {
        const allSpans = li.querySelectorAll(".leaf-value");
        
        for (const span of allSpans) {
            if (span.textContent.trim() === String(osiId)) {
                // Get the 'li' containing the value 14
                const valueLi = span.closest('li'); 
                // Get the 'li' above it (should be 'id')
                const idLi = valueLi.parentElement.closest('li'); 

                // Check if we are inside an "id" structure
                if (idLi && idLi.dataset.nodeKey === "id") {
                    targetIndexLi = li; // This is the [0], [1] index node
                    break;
                }
            }
        }
        if (targetIndexLi) break;
    }

    if (targetIndexLi) {
        // 1. Open the Topic (e.g. movingObjects)
        topicLi.classList.add("open");

        // 2. Open the Index ([0], [1], etc)
        targetIndexLi.classList.add("open");

        // 3. Open ALL nested properties (id, base, position, etc)
        const nestedNodes = targetIndexLi.querySelectorAll("li.node");
        nestedNodes.forEach(n => n.classList.add("open"));

        // 4. Scroll and Flash
        targetIndexLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        const caret = targetIndexLi.querySelector(":scope > .caret");
        if (caret) {
            caret.classList.add("updated-flash");
            setTimeout(() => caret.classList.remove("updated-flash"), 1000);
        }
    }
}

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
        title.innerHTML = `<span class="node-key">${key}</span>`;
        // title.textContent = key;
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
            const isOpening = !parentLi.classList.contains("open");

            parentLi.classList.toggle("open");

            if (e.shiftKey) {
                const childNodes = parentLi.querySelectorAll("li.node");
                childNodes.forEach(child => {
                    if (isOpening) {
                        child.classList.add("open");
                    }
                    else {
                        child.classList.remove("open");
                    }
                });
            }
        };
    } else {
        const val = (data === null || data === undefined) ? "" : data;
        li.innerHTML = `<span class="node-key">${key}</span> <span class="leaf-value">${val}</span>`;
    }
    return li;
}

export function collapseTree() {
    const treeRoot = document.getElementById("gtTree");
    if (!treeRoot) return;

    // Find all list items that are currently open
    const openNodes = treeRoot.querySelectorAll("li.open");

    openNodes.forEach(node => {
        node.classList.remove("open");
    });

    // Optional: Scroll back to the top of the sidebar 
    // so the user starts from a clean slate
    treeRoot.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!ul) return false;
    let anyChildChanged = false;
    
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
            // updateElement(existingNodes.get(key), value);
            const changed = syncBranchOrLeaf(existingNodes.get(key), key, value);
            if (changed) anyChildChanged = true;
            existingNodes.delete(key);
        } else {
            ul.appendChild(createNode(key, value));
            anyChildChanged = true;
        }
    });

    existingNodes.forEach(node => ul.removeChild(node));

    return anyChildChanged;
}

function syncBranchOrLeaf(li, key, newData) {
    const childrenUl = li.querySelector(":scope > ul");
    const isNewDataValidObject = newData !== null && typeof newData === "object";

    // 1. TRANSFORMATION: Null -> Object
    if (isNewDataValidObject && !childrenUl) {
        const freshNode = createNode(key, newData);
        li.innerHTML = "";
        while (freshNode.firstChild) li.appendChild(freshNode.firstChild);
        triggerFlash(li); // Flash because the structure is new
        return;
    }

    // 2. REVERSE: Object -> Null
    if (!isNewDataValidObject && childrenUl) {
        li.classList.remove("open");
        li.innerHTML = `<span class="node-key">${key}</span> <span class="leaf-value">${newData ?? ""}</span>`;
        triggerFlash(li); // Flash because the data vanished
        return;
    }

    // 3. REGULAR UPDATE: Branch
    if (childrenUl && isNewDataValidObject) {
        // If open, we go deeper. 
        // We do NOT flash this branch here; the children will flash themselves.
        if (li.classList.contains("open")) {
            reconcile(childrenUl, newData);
        }
    } 
    
    // 4. REGULAR UPDATE: Leaf
    else {
        const valSpan = li.querySelector(":scope > .leaf-value");
        if (valSpan) {
            const nextVal = (newData === undefined || newData === null) ? "" : String(newData);
            if (valSpan.textContent !== nextVal) {
                valSpan.textContent = nextVal;
                triggerFlash(li); // Flash ONLY the leaf that actually changed
            }
        }
    }
}

function triggerFlash(el) {
    // Remove class to restart animation if it's already running
    el.classList.remove("updated-flash");
    // Trigger a reflow to allow the browser to see the class removal
    void el.offsetWidth; 
    el.classList.add("updated-flash");
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

export function initResizableSidebar(camera, renderer) {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const viewer = document.getElementById('viewer');
    
    let isResizing = false;

    // 1. Mouse Down - Start resizing
    resizer.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        // Prevent text selection while dragging
        document.body.style.userSelect = 'none'; 
    });

    // 2. Mouse Move - Calculate and Apply Width
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // The mouse X position determines the new sidebar width
        let newWidth = e.clientX;

        // Apply constraints (match these to your CSS min/max)
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 800) newWidth = 800;

        sidebar.style.width = `${newWidth}px`;

        // 3. Update Three.js to prevent stretching
        // Use viewer.clientWidth/Height because the viewer div 
        // automatically resizes thanks to flex: 1
        const width = viewer.clientWidth;
        const height = viewer.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        renderer.setSize(width, height);
    });

    // 4. Mouse Up - Stop resizing
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        }
    });
}
