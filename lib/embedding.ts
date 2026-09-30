import { pipeline, env } from "@huggingface/transformers";
import path from "node:path";
export const MODEL = "Xenova/all-MiniLM-L6-v2";
// Pinned after resolving the model repository; generation and queries share this config.
export const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const DIMENSIONS = 384;
export const DTYPE = "fp32";
env.cacheDir = path.join(process.cwd(), ".cache", "models");
function createExtractor() {
  return pipeline("feature-extraction", MODEL, {
    dtype: DTYPE,
    revision: REVISION,
  });
}
let extractorPromise: ReturnType<typeof createExtractor> | undefined;
export async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await (extractorPromise ??= createExtractor().catch(
    (error) => {
      extractorPromise = undefined;
      throw error;
    },
  ));
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}
