import { Live2DManager } from "../../live2d.ts";

export default () => {
  let l2d = null;
  let canvasEl = null;

  return {
    oncreate({ dom }) {
      canvasEl = dom.querySelector("canvas");
      if (!canvasEl) return;

      // 初始化 Live2D
      const w = dom.clientWidth || 400;
      const h = dom.clientHeight || 400;
      console.log("[Live2dChar] Container size:", w, "x", h);

      l2d = new Live2DManager({
        canvas: canvasEl,
        width: w,
        height: h,
        modelUrl: "./live2d/models/hiyori/Hiyori.model3.json",
      });

      // Trigger mouse interaction on the canvas
      canvasEl.addEventListener("mousedown", () => {
        console.log("[Live2dChar] Canvas mousedown");
      });

      l2d.loadModel().catch((err) => {
        console.warn("[Live2D] load failed:", err);
      });
    },

    onremove() {
      if (l2d) {
        l2d.destroy();
        l2d = null;
      }
    },

    view() {
      return m(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
          },
        },
        [
          m("canvas", {
            style: {
              width: "100%",
              height: "100%",
              display: "block",
            },
          }),
        ],
      );
    },
  };
};
