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

export function positionGUI() {
    const banner = document.querySelector(".ui");
    const gui = document.querySelector(".dg");

    if (!banner || !gui) return;

    const height = banner.getBoundingClientRect().height;
    gui.style.top = height + "px";
}

window.addEventListener("resize", positionGUI);
window.addEventListener("load", positionGUI);