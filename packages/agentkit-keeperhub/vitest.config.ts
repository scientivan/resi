import { defineConfig } from "vitest/config";
// Tes berjalan terhadap `dist/`, bukan `src/`, karena dekorator @CreateAction
// milik AgentKit membutuhkan metadata yang hanya dihasilkan tsc
// (`emitDecoratorMetadata`), bukan esbuild. Efek sampingnya bagus: yang teruji
// adalah artefak yang benar-benar diterbitkan.
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
