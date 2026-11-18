{ lib, stdenv, nodejs_24, pnpm_10, fetchPnpmDeps, pnpmConfigHook, makeWrapper }:
stdenv.mkDerivation (finalAttrs: {
  pname = "flare-web";
  version = "0.1.0";
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let name = baseNameOf path; in
      !(builtins.elem name [ ".git" "node_modules" "dist" ".data" ".playwright-mcp" "test-results" "playwright-report" ".agents" ".aws" ".codex" "z-ai" ])
      && !(lib.hasPrefix ".env" name);
  };
  nativeBuildInputs = [ nodejs_24 pnpm_10 pnpmConfigHook makeWrapper ];
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-KXScGDagwlpcLx2qqcAIcW4BSQ5whUNjsyYUTO9B2r0=";
  };
  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/flare-web $out/bin
    cp -r dist server src package.json node_modules $out/lib/flare-web/
    makeWrapper ${nodejs_24}/bin/node $out/bin/flare-web \
      --add-flags "$out/lib/flare-web/node_modules/tsx/dist/cli.mjs $out/lib/flare-web/server/index.ts" \
      --set NODE_ENV production \
      --chdir "$out/lib/flare-web" \
      --run 'export FLARE_DATA_DIR="''${FLARE_DATA_DIR:-''${XDG_STATE_HOME:-$HOME/.local/state}/flare-web}"'
    runHook postInstall
  '';
  meta = { description = "Flare social Web client"; license = lib.licenses.agpl3Only; mainProgram = "flare-web"; platforms = lib.platforms.unix; };
})
