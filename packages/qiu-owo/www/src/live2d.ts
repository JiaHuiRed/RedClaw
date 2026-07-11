/**
 * Live2D 模型管理器
 * 使用 pixi-live2d-display 渲染 Live2D 模型
 */
import * as PIXI from 'pixi.js';
// 从 cubism4 子路径导入，避免主模块强制检查 Cubism 2
import { Live2DModel } from 'pixi-live2d-display/cubism4';

const MODEL_URL = './models/hiyori/Hiyori.model3.json';

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

    this.model = await Live2DModel.from(modelUrl, {
      autoInteract: false,
    });

    // Center and scale the model to fill the container
    this.model.anchor.set(0.5, 0.5);
    this.model.position.set(this.opts.width / 2, this.opts.height * 0.5);

    // Scale to fill 95% of container height
    const targetH = this.opts.height * 0.95;
    const modelH = this.model.height || 1;
    const s = targetH / modelH;
    this.model.scale.set(s);

    this.app.stage.addChild(this.model);
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
      const targetH = rect.height * 0.95;
      const modelH = this.model.height || 1;
      this.model.scale.set(targetH / modelH);
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
