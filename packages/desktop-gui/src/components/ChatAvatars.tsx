import { Loader2, Pencil } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

const AVATAR_SIZE = 256;

/** 读取图片文件 → canvas 居中裁剪缩放到 AVATAR_SIZE 方形 → JPEG data URL（几十 KB） */
export function compressImageFile(
  file: File,
  maxSize = AVATAR_SIZE,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas 不可用"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, maxSize, maxSize);
        const scale = maxSize / Math.max(img.width, img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("图片解码失败"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** 圆形头像：有 src 显示图片，加载失败或无 src 回落为图标 */
function Avatar({
  src,
  icon,
  size = 50,
}: {
  src: string | null;
  icon: React.ReactNode;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: size,
          height: size,
          background: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
        }}
      >
        {icon}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

/** 头像 + 悬浮铅笔按钮：点击换头像（隐藏 file input → 压缩 → onPick 回调） */
export function EditableAvatar({
  src,
  icon,
  size = 50,
  uploading,
  title,
  onPick,
}: {
  src: string | null;
  icon: React.ReactNode;
  size?: number;
  uploading: boolean;
  title: string;
  onPick: (file: File | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files?.[0]);
    e.target.value = "";
  };
  return (
    <div className="relative group shrink-0">
      <Avatar src={src} icon={icon} size={size} />
      <button
        type="button"
        title={title}
        onClick={() => fileRef.current?.click()}
        className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-black/40 text-white"
      >
        {uploading ? <Loader2 size={20} className="animate-spin" /> : <Pencil size={20} />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
