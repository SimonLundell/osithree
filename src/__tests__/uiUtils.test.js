import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../scene.js", () => ({
  options: { play: false },
  latestGt: null,
  updateTree: () => {}
}));
import { initTree, focusAndExpandObject, collapseTree } from "../uiUtils.js";
import { GT_ORDER } from "../constants.js";

describe("uiUtils", () => {
  // These tests cover the DOM tree helpers used for the side-panel OSI object tree.
  beforeEach(() => {
    document.body.innerHTML = "<ul id='gtTree'></ul>";
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Confirm the tree is built with ordered root placeholders even when some data is missing.
  it("initializes the tree with placeholder roots", () => {
    initTree({ hostVehicleId: 42, movingObject: [{ id: 1 }] });

    const rootItems = document.querySelectorAll("#gtTree > li");
    expect(rootItems.length).toBe(GT_ORDER.length);
    expect(document.querySelector("#gtTree > li[data-node-key='movingObject']")).toBeTruthy();
    expect(document.querySelector("#gtTree > li[data-node-key='hostVehicleId']")).toBeTruthy();
  });

  // Verify that selecting an object ID opens the correct tree branch and highlights it.
  it("focuses and expands the correct tree object by OSI id", async () => {
    document.body.innerHTML = `
      <ul id="gtTree">
        <li data-node-key="movingObject">
          <ul>
            <li data-node-key="[0]" class="node">
              <ul>
                <li data-node-key="id">
                  <ul>
                    <li data-node-key="value"><span class="leaf-value">123</span></li>
                  </ul>
                </li>
              </ul>
            </li>
            <li data-node-key="[1]" class="node">
              <ul>
                <li data-node-key="id">
                  <ul>
                    <li data-node-key="value"><span class="leaf-value">456</span></li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    `;

    vi.useFakeTimers();
    focusAndExpandObject("movingObject", 123);

    const topicLi = document.querySelector("#gtTree > li[data-node-key='movingObject']");
    const targetIndexLi = topicLi.querySelector("li[data-node-key='[0]']");

    expect(topicLi.classList.contains("open")).toBe(true);
    expect(targetIndexLi.classList.contains("open")).toBe(true);
    expect(targetIndexLi.classList.contains("updated-flash")).toBe(true);

    await vi.runOnlyPendingTimersAsync();
    expect(targetIndexLi.classList.contains("updated-flash")).toBe(false);
    vi.useRealTimers();
  });

  // Ensure collapseTree closes every expanded branch and resets scroll position.
  it("collapses all open nodes in the tree", () => {
    const tree = document.getElementById("gtTree");
    tree.innerHTML = `<li class="open"></li><li class="open"></li>`;
    tree.scrollTo = vi.fn();

    collapseTree();

    expect(tree.querySelectorAll(".open").length).toBe(0);
    expect(tree.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
