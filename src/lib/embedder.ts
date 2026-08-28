import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { domain } from "../config/domain";

// 원격 가중치만 쓴다. 로컬 /models 경로를 먼저 찾다가 404를 내는 일을 막는다.
env.allowLocalModels = false;

export type LoadProgress = {
  status: "idle" | "downloading" | "ready" | "error";
  /** 0~1. 파일별 진행률을 합쳐 낸 값이라 근사치다. */
  progress: number;
  message: string;
};

type ProgressEvent = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

let instance: Promise<FeatureExtractionPipeline> | null = null;

/**
 * 브라우저에서 질문 하나를 임베딩한다.
 *
 * 문서 벡터는 빌드 때 미리 계산해 두었으므로 여기서 도는 것은 질문뿐이다.
 * 대신 두 벡터가 같은 공간에 있어야 하므로 모델 ID와 그래프 파일을
 * domain.config.json 한곳에서 읽어 양쪽이 갈라지지 않게 한다.
 */
export function getEmbedder(onProgress?: (p: LoadProgress) => void) {
  if (instance) return instance;

  const files = new Map<string, { loaded: number; total: number }>();

  instance = pipeline("feature-extraction", domain.embedding.modelId, {
    model_file_name: domain.embedding.modelFileName,
    dtype: "fp32", // 파일명을 직접 지정하므로 접미사는 붙이지 않는다
    device: "wasm",
    progress_callback: (e: ProgressEvent) => {
      if (!onProgress) return;
      if (e.status === "progress" && e.file && e.total) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        onProgress({
          status: "downloading",
          progress: total ? loaded / total : 0,
          message: `임베딩 모델 내려받는 중 · ${(loaded / 1e6).toFixed(0)}MB / ${(total / 1e6).toFixed(0)}MB`,
        });
      } else if (e.status === "ready") {
        onProgress({ status: "ready", progress: 1, message: "임베딩 모델 준비 완료" });
      }
    },
  }) as Promise<FeatureExtractionPipeline>;

  instance.catch(() => {
    instance = null; // 다음 질문에서 다시 시도할 수 있게 둔다
  });

  return instance;
}

export async function embedQuery(text: string, onProgress?: (p: LoadProgress) => void) {
  const extract = await getEmbedder(onProgress);
  const out = await extract(domain.embedding.queryPrefix + text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(out.data as Float32Array);
}
