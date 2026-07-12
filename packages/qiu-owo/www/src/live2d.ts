// 从 cubism4 子路径导入，避免主模块强制检查 Cubism 2
import { Live2DModel } from "pixi-live2d-display/cubism4";
/**
 * Live2D 模型管理器
 * 使用 pixi-live2d-display 渲染 Live2D 模型
 */
import * as PIXI from "pixi.js";

const MODEL_URL = "./models/hiyori/Hiyori.model3.json";

export interface Live2DManagerOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  modelUrl?: string;
}

export class Live2DManager {
  private app: PIXI.Application;
  private model: Live2DModel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private modelNaturalW = 0;
  private modelNaturalH = 0;

  constructor(private opts: Live2DManagerOptions) {
    this.app = new PIXI.Application({
      view: opts.canvas,
      width: opts.width,
      height: opts.height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Handle container resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(opts.canvas.parentElement!);
  }

  async loadModel(url?: string): Promise<void> {
    const modelUrl = url || this.opts.modelUrl || MODEL_URL;
    console.log("[Live2D] Loading model from:", modelUrl);

    this.model = await Live2DModel.from(modelUrl, {
      ticker: this.app.ticker,
      autoHitTest: false,
      autoFocus: false,
    });

    console.log("[Live2D] Model loaded. Size:", this.model.width, "x", this.model.height);

    // Cache the model's natural coordinate-space dimensions (stable, unlike rendered pixel size)
    const coreModel = (this.model as any).internalModel?.coreModel;
    const m = coreModel?.getModel?.();
    if (m) {
      this.modelNaturalW = m.getCanvasWidth?.() || 0;
      this.modelNaturalH = m.getCanvasHeight?.() || 0;
    }
    // Fallback: use the sprite's dimensions before any resize
    if (!this.modelNaturalW || !this.modelNaturalH) {
      this.modelNaturalW = this.model.width || 1;
      this.modelNaturalH = this.model.height || 1;
    }
    console.log("[Live2D] Natural model size:", this.modelNaturalW, "x", this.modelNaturalH);

    // Center the model
    this.model.anchor.set(0.5, 0.5);

    // Scale to fit container without distortion (use smaller axis)
    this.fitModel();

    this.model.position.set(this.opts.width / 2, this.opts.height * 0.5);

    this.app.stage.addChild(this.model);

    console.log(
      "[Live2D] Model added to stage. Scale:",
      this.model.scale.x,
      "Position:",
      this.model.position.x,
      this.model.position.y,
    );

    // Start idle animation with a small delay to ensure model is fully initialized
    setTimeout(() => {
      try {
        this.model!.motion("Idle");
        console.log("[Live2D] Idle motion triggered");
      } catch (e) {
        console.warn("[Live2D] Idle motion failed:", e);
      }
    }, 100);

    // Also try clicking the model to trigger interaction
    this.model.on("hit", (hitAreas: string[]) => {
      console.log("[Live2D] Hit:", hitAreas);
      if (hitAreas.includes("Body")) {
        this.model?.motion("TapBody");
      }
    });

    // Manual mouse tracking for model eye follow (since autoInteract is broken with pixi v7+)
    const canvas = this.opts.canvas;
    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (!this.model) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      // Focus at the model's face area
      this.model.focus(x * rect.width, y * rect.height);
    });
  }

  private fitModel() {
    if (!this.model) return;

    const modelW = this.modelNaturalW || 1;
    const modelH = this.modelNaturalH || 1;

    console.log(
      "[Live2D] fitModel - Container:",
      this.opts.width,
      "x",
      this.opts.height,
      "Model natural:",
      modelW,
      "x",
      modelH,
    );

    // Fit to the smaller axis so the model is never distorted
    const scaleW = (this.opts.width * 0.9) / modelW;
    const scaleH = (this.opts.height * 0.9) / modelH;
    const scale = Math.min(scaleW, scaleH) * 1.3;

    console.log("[Live2D] fitModel - Scale:", scale, "(scaleW:", scaleW, "scaleH:", scaleH, ")");
    this.model.scale.set(scale);
  }

  private handleResize() {
    const parent = this.opts.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    this.opts.width = rect.width;
    this.opts.height = rect.height;

    this.app.renderer.resize(rect.width, rect.height);

    if (this.model) {
      this.model.position.set(rect.width / 2, rect.height * 0.5);
      this.fitModel();
    }
  }

  startTalking() {
    // v0.0.1: 内置 idle 动画自动运行
    // 未来: 触发特定口型动画组
  }

  stopTalking() {
    // 回到 idle
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.model?.destroy();
    this.app.destroy(true, { children: true });
  }
}
