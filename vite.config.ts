import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages 는 /사용자명.github.io/저장소이름/ 하위에 올라간다.
  // 상대 경로로 두면 저장소 이름을 몰라도 자산을 찾는다.
  base: "./",
  plugins: [react()],
  build: {
    // 벡터스토어(chunks.json)는 public 에서 그대로 복사되므로 번들에 들어가지 않는다.
    chunkSizeWarningLimit: 1200,
  },
});
