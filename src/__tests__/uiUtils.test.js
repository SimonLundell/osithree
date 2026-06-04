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
                <li data-node-key="id" class="node">
                  <ul>
                    <li data-node-key="value" class="node"><span class="leaf-value">123</span></li>
                  </ul>
                </li>
              </ul>
            </li>
            <li data-node-key="[1]" class="node">
              <ul>
                <li data-node-key="id" class="node">
                  <ul>
                    <li data-node-key="value" class="node"><span class="leaf-value">456</span></li>
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
    const idBranch = targetIndexLi.querySelector("li[data-node-key='id']");

    expect(topicLi.classList.contains("open")).toBe(true);
    expect(targetIndexLi.classList.contains("open")).toBe(true);
    expect(idBranch.classList.contains("open")).toBe(true);
    expect(targetIndexLi.classList.contains("updated-flash")).toBe(true);

    await vi.runOnlyPendingTimersAsync();
    expect(targetIndexLi.classList.contains("updated-flash")).toBe(false);
    vi.useRealTimers();
  });

  it("expands every nested sub-element under the selected index", () => {
    document.body.innerHTML = `
      <ul id="gtTree">
        <li data-node-key="movingObject">
          <ul>
            <li data-node-key="[0]" class="node">
              <ul>
                <li data-node-key="id" class="node">
                  <ul>
                    <li data-node-key="value" class="node"><span class="leaf-value">123</span></li>
                  </ul>
                </li>
                <li data-node-key="classification" class="node">
                  <ul>
                    <li data-node-key="type" class="node"><span class="leaf-value">car</span></li>
                  </ul>
                </li>
              </ul>
            </li>
            <li data-node-key="[1]" class="node">
              <ul>
                <li data-node-key="classification" class="node">
                  <ul>
                    <li data-node-key="type" class="node"><span class="leaf-value">truck</span></li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    `;

    focusAndExpandObject("movingObject", 123);

    const targetIndexLi = document.querySelector("#gtTree li[data-node-key='[0]']");
    const valueLi = targetIndexLi.querySelector("li[data-node-key='value']");
    const classificationLi = targetIndexLi.querySelector("li[data-node-key='classification']");
    const typeLi = targetIndexLi.querySelector("li[data-node-key='type']");

    const siblingIndexLi = document.querySelector("#gtTree li[data-node-key='[1]']");
    const siblingClassificationLi = siblingIndexLi.querySelector("li[data-node-key='classification']");

    expect(targetIndexLi.classList.contains("open")).toBe(true);
    expect(valueLi.classList.contains("open")).toBe(true);
    expect(classificationLi.classList.contains("open")).toBe(true);
    expect(typeLi.classList.contains("open")).toBe(true);
    expect(siblingIndexLi.classList.contains("open")).toBe(false);
    expect(siblingClassificationLi.classList.contains("open")).toBe(false);
  });

  it("expands the matching boundaryLine index for a roadmark segment", () => {
    document.body.innerHTML = `
      <ul id="gtTree">
        <li data-node-key="laneBoundary">
          <ul>
            <li data-node-key="[0]" class="node">
              <ul>
                <li data-node-key="boundaryLine" class="node">
                  <ul>
                    <li data-node-key="[0]" class="node"><span class="leaf-value">segment0</span></li>
                    <li data-node-key="[1]" class="node"><span class="leaf-value">segment1</span></li>
                  </ul>
                </li>
                <li data-node-key="id" class="node">
                  <ul>
                    <li data-node-key="value" class="node"><span class="leaf-value">123</span></li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    `;

    focusAndExpandObject("laneBoundary", 123, { boundaryLineIndex: 1 });

    const topicLi = document.querySelector("#gtTree > li[data-node-key='laneBoundary']");
    const targetIndexLi = topicLi.querySelector("li[data-node-key='[0]']");
    const boundaryLineLi = targetIndexLi.querySelector("li[data-node-key='boundaryLine']");
    const segmentLi = boundaryLineLi.querySelector("li[data-node-key='[1]']");

    expect(topicLi.classList.contains("open")).toBe(true);
    expect(targetIndexLi.classList.contains("open")).toBe(true);
    expect(boundaryLineLi.classList.contains("open")).toBe(true);
    expect(segmentLi.classList.contains("open")).toBe(true);
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
